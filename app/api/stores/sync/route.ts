import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isLeadsToolOwner } from "@/lib/constants";
import { parseCsv, findColumnIndex } from "@/lib/csv";
import type { Store } from "@/lib/types";

export const dynamic = "force-dynamic";
// A full sync can involve geocoding dozens/hundreds of new or
// changed-address rows sequentially-ish (rate-limited, see below) -
// longer than the Next.js default.
export const maxDuration = 60;

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

const NAME_COLUMN_CANDIDATES = ["store", "store name", "name", "location", "location name"];
const ADDRESS_COLUMN_CANDIDATES = ["address", "store address", "location address"];
const TOTAL_COLUMN_CANDIDATES = ["total spaces", "total", "spaces total", "spaces"];
const AVAILABLE_COLUMN_CANDIDATES = ["available", "spaces available", "open", "open spaces", "spaces open"];

type GeocodeResponse = {
  status: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
};

function parseCount(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

async function geocode(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  try {
    const res = await fetch(url.toString());
    const data = (await res.json()) as GeocodeResponse;
    const location = data.results[0]?.geometry.location;
    return data.status === "OK" && location ? location : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser(token);
  if (userError || !userData.user || !isLeadsToolOwner(userData.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    return NextResponse.json(
      { error: "Store sync isn't configured yet. Set GOOGLE_SHEET_ID in your environment." },
      { status: 501 }
    );
  }
  // Places/Geocoding share one Google Cloud API key across this app.
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  csvUrl.searchParams.set("tqx", "out:csv");
  if (process.env.GOOGLE_SHEET_TAB) {
    csvUrl.searchParams.set("sheet", process.env.GOOGLE_SHEET_TAB);
  }

  let csvText: string;
  try {
    const res = await fetch(csvUrl.toString());
    if (!res.ok) {
      return NextResponse.json(
        { error: "Couldn't read that Google Sheet - make sure it's shared as \"Anyone with the link → Viewer.\"" },
        { status: 502 }
      );
    }
    csvText = await res.text();
  } catch {
    return NextResponse.json({ error: "Couldn't reach Google Sheets - try again in a moment." }, { status: 502 });
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return NextResponse.json({ error: "That sheet doesn't have any data rows below the header." }, { status: 400 });
  }
  const [header, ...dataRows] = rows;
  const nameCol = findColumnIndex(header, NAME_COLUMN_CANDIDATES);
  const addressCol = findColumnIndex(header, ADDRESS_COLUMN_CANDIDATES);
  const totalCol = findColumnIndex(header, TOTAL_COLUMN_CANDIDATES);
  const availableCol = findColumnIndex(header, AVAILABLE_COLUMN_CANDIDATES);
  if (nameCol === -1) {
    return NextResponse.json(
      { error: `Couldn't find a store-name column. Saw: ${header.join(", ")}` },
      { status: 400 }
    );
  }

  // Acts as this user for every DB call below (RLS-scoped, same as a
  // normal client insert) - the service role is never used here, this
  // route only ever touches the calling user's own rows.
  const supabaseAsUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: existingStores } = await supabaseAsUser.from("stores").select("*").eq("user_id", userData.user.id);
  const existingBySheetRow = new Map((existingStores as Store[] | null ?? []).map((s) => [s.sheet_row, s]));

  const upserts: Partial<Store>[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const sheetRow = i + 2; // header is row 1
    const name = (row[nameCol] ?? "").trim();
    if (!name) continue;
    const address = addressCol !== -1 ? (row[addressCol] ?? "").trim() : "";
    const spacesTotal = totalCol !== -1 ? parseCount(row[totalCol]) : 0;
    const spacesAvailable = availableCol !== -1 ? parseCount(row[availableCol]) : 0;

    const existing = existingBySheetRow.get(sheetRow);
    let lat = existing?.lat ?? null;
    let lng = existing?.lng ?? null;
    // Only re-geocode when the address actually changed (or there's
    // never been a successful geocode) - the sheet's spaces_available
    // column is expected to change often, its address rarely, and a
    // geocode call costs real money.
    if (address && apiKey && (!existing || existing.address !== address || lat === null)) {
      const geocoded = await geocode(address, apiKey);
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
      }
    }

    upserts.push({
      user_id: userData.user.id,
      name,
      address,
      lat,
      lng,
      spaces_total: spacesTotal,
      spaces_available: spacesAvailable,
      sheet_row: sheetRow,
    });
  }

  if (upserts.length === 0) {
    return NextResponse.json({ error: "No stores with a name were found in that sheet." }, { status: 400 });
  }

  const { data: synced, error: upsertError } = await supabaseAsUser
    .from("stores")
    .upsert(upserts, { onConflict: "user_id,sheet_row" })
    .select("*");
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    stores: synced,
    geocodingSkipped: !apiKey,
  });
}
