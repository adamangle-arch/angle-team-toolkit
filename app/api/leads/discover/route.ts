import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isLeadsToolOwner, LEAD_CATEGORIES } from "@/lib/constants";
import type { DiscoveredBusiness } from "@/lib/types";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

const MIN_RADIUS_MILES = 1;
const MAX_RADIUS_MILES = 30;
// Google's own Nearby Search cap.
const MAX_RADIUS_METERS = 50000;
const METERS_PER_MILE = 1609.34;

type GeocodeResponse = {
  status: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
};

type NearbySearchResponse = {
  status: string;
  error_message?: string;
  results: { place_id: string; name: string; vicinity?: string }[];
};

type PlaceDetailsResponse = {
  status: string;
  result?: {
    name: string;
    formatted_address?: string;
    formatted_phone_number?: string;
    website?: string;
    geometry?: { location: { lat: number; lng: number } };
  };
};

// Only searches this route is allowed to run - lets a client send a
// stable category key rather than a raw Google `type`/keyword string,
// same reasoning as every other picker-backed field in this app (see
// LEAD_CATEGORIES itself).
function categoryLabelAndSearchParam(categoryKey: string): { label: string; type: string | null } | null {
  const category = LEAD_CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) return null;
  return { label: category.label, type: category.placeType };
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

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Business search isn't configured yet. Set GOOGLE_PLACES_API_KEY in your environment." },
      { status: 501 }
    );
  }

  let body: { address?: string; radiusMiles?: number; category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const address = (body.address ?? "").trim();
  if (!address) {
    return NextResponse.json({ error: "Enter an address or zip code to search near." }, { status: 400 });
  }
  const radiusMiles = Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, Number(body.radiusMiles) || 10));
  const categoryMatch = categoryLabelAndSearchParam(body.category ?? "");
  if (!categoryMatch) {
    return NextResponse.json({ error: "Pick a business category to search." }, { status: 400 });
  }

  const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  geocodeUrl.searchParams.set("address", address);
  geocodeUrl.searchParams.set("key", apiKey);
  const geocodeRes = await fetch(geocodeUrl.toString());
  const geocodeData = (await geocodeRes.json()) as GeocodeResponse;
  const location = geocodeData.results[0]?.geometry.location;
  if (geocodeData.status !== "OK" || !location) {
    return NextResponse.json({ error: "Couldn't find that address. Try a more specific one." }, { status: 400 });
  }

  const nearbyUrl = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  nearbyUrl.searchParams.set("location", `${location.lat},${location.lng}`);
  nearbyUrl.searchParams.set("radius", String(Math.min(MAX_RADIUS_METERS, Math.round(radiusMiles * METERS_PER_MILE))));
  if (categoryMatch.type) {
    nearbyUrl.searchParams.set("type", categoryMatch.type);
  } else {
    nearbyUrl.searchParams.set("keyword", categoryMatch.label);
  }
  nearbyUrl.searchParams.set("key", apiKey);
  const nearbyRes = await fetch(nearbyUrl.toString());
  const nearbyData = (await nearbyRes.json()) as NearbySearchResponse;
  if (nearbyData.status !== "OK" && nearbyData.status !== "ZERO_RESULTS") {
    return NextResponse.json(
      { error: nearbyData.error_message || `Google Places search failed (${nearbyData.status}).` },
      { status: 502 }
    );
  }

  // First page only (up to 20 results) - fetching further pages needs a
  // ~2s wait for Google's next_page_token to activate, not worth the
  // latency for a "start here" tool; narrow the category or radius for
  // more targeted results instead.
  const candidates = nearbyData.results ?? [];

  // Nearby Search doesn't return phone/website - a Place Details call per
  // result is the only way to get them, run in parallel to keep this fast.
  const detailed = await Promise.all(
    candidates.map(async (c): Promise<DiscoveredBusiness> => {
      const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      detailsUrl.searchParams.set("place_id", c.place_id);
      detailsUrl.searchParams.set("fields", "name,formatted_address,formatted_phone_number,website,geometry");
      detailsUrl.searchParams.set("key", apiKey);
      try {
        const detailsRes = await fetch(detailsUrl.toString());
        const detailsData = (await detailsRes.json()) as PlaceDetailsResponse;
        const result = detailsData.result;
        return {
          google_place_id: c.place_id,
          business_name: result?.name || c.name,
          category: categoryMatch.label,
          address: result?.formatted_address || c.vicinity || "",
          phone: result?.formatted_phone_number || "",
          website: result?.website || "",
          lat: result?.geometry?.location.lat ?? null,
          lng: result?.geometry?.location.lng ?? null,
        };
      } catch {
        // A single failed Details lookup shouldn't drop the whole search -
        // this result just comes back with the bare minimum from Nearby
        // Search instead of phone/website.
        return {
          google_place_id: c.place_id,
          business_name: c.name,
          category: categoryMatch.label,
          address: c.vicinity || "",
          phone: "",
          website: "",
          lat: null,
          lng: null,
        };
      }
    })
  );

  return NextResponse.json({ results: detailed });
}
