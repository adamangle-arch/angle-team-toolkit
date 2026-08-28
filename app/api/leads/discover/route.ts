import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isLeadsToolOwner, LEAD_CATEGORIES } from "@/lib/constants";
import { findEmailForWebsite } from "@/lib/emailScrape";
import type { DiscoveredBusiness } from "@/lib/types";

export const dynamic = "force-dynamic";
// Longer than the Next.js default (10s) - "all categories" runs up to 9
// Nearby Searches plus a Place Details + email-scrape pass per result,
// all in parallel, but a slow site or two in the mix can still push this
// past 10s.
export const maxDuration = 60;

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

const MIN_RADIUS_MILES = 1;
const MAX_RADIUS_MILES = 30;
// Google's own Nearby Search cap.
const MAX_RADIUS_METERS = 50000;
const METERS_PER_MILE = 1609.34;
// Caps how many results get a Place Details + email-scrape pass (the
// expensive part - a paid Google call plus up to 2 site fetches each)
// when "all categories" turns up more than this after de-duping.
const MAX_DETAILED_RESULTS = 60;

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

// "all" loops over every real category below (skipping "other" - its
// placeType is null, so it'd search Google for the literal keyword
// "Other Local Business," which isn't a meaningful query on its own).
const SEARCHABLE_CATEGORIES = LEAD_CATEGORIES.filter((c) => c.key !== "other");

function categoriesToSearch(categoryKey: string): { label: string; type: string | null }[] | null {
  if (categoryKey === "all") {
    return SEARCHABLE_CATEGORIES.map((c) => ({ label: c.label, type: c.placeType }));
  }
  const category = LEAD_CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) return null;
  return [{ label: category.label, type: category.placeType }];
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
  const categories = categoriesToSearch(body.category ?? "");
  if (!categories) {
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

  const radiusParam = String(Math.min(MAX_RADIUS_METERS, Math.round(radiusMiles * METERS_PER_MILE)));

  // One Nearby Search per category, in parallel - each result gets
  // tagged with the category that found it (see the map below).
  const perCategoryResults = await Promise.all(
    categories.map(async (categoryMatch) => {
      const nearbyUrl = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
      nearbyUrl.searchParams.set("location", `${location.lat},${location.lng}`);
      nearbyUrl.searchParams.set("radius", radiusParam);
      if (categoryMatch.type) {
        nearbyUrl.searchParams.set("type", categoryMatch.type);
      } else {
        nearbyUrl.searchParams.set("keyword", categoryMatch.label);
      }
      nearbyUrl.searchParams.set("key", apiKey);
      const nearbyRes = await fetch(nearbyUrl.toString());
      const nearbyData = (await nearbyRes.json()) as NearbySearchResponse;
      if (nearbyData.status !== "OK" && nearbyData.status !== "ZERO_RESULTS") {
        return { categoryMatch, results: [], error: nearbyData.error_message || `(${nearbyData.status})` };
      }
      // First page only (up to 20 results per category) - fetching
      // further pages needs a ~2s wait for Google's next_page_token to
      // activate, not worth the latency here; narrow the radius for
      // more targeted results instead.
      return { categoryMatch, results: nearbyData.results ?? [], error: null as string | null };
    })
  );

  const searchErrors = perCategoryResults.filter((r) => r.error).map((r) => `${r.categoryMatch.label}: ${r.error}`);
  // Only fail the whole request if EVERY category search failed - a
  // partial failure (one category's search errored, the rest worked)
  // still returns whatever succeeded.
  if (searchErrors.length === perCategoryResults.length && perCategoryResults.length > 0) {
    return NextResponse.json({ error: `Google Places search failed - ${searchErrors[0]}` }, { status: 502 });
  }

  // De-dupe across categories (a business can plausibly match more than
  // one, e.g. a restaurant that also shows up under a "bar" keyword) -
  // first category to find it wins the label.
  const seenPlaceIds = new Set<string>();
  const candidates: { place_id: string; name: string; vicinity?: string; categoryLabel: string }[] = [];
  for (const { categoryMatch, results } of perCategoryResults) {
    for (const r of results) {
      if (seenPlaceIds.has(r.place_id)) continue;
      seenPlaceIds.add(r.place_id);
      candidates.push({ ...r, categoryLabel: categoryMatch.label });
    }
  }
  const boundedCandidates = candidates.slice(0, MAX_DETAILED_RESULTS);

  // Nearby Search doesn't return phone/website - a Place Details call per
  // result is the only way to get them. Email-finding runs right after,
  // per result, since it needs the website Details just returned.
  const detailed = await Promise.all(
    boundedCandidates.map(async (c): Promise<DiscoveredBusiness> => {
      const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      detailsUrl.searchParams.set("place_id", c.place_id);
      detailsUrl.searchParams.set("fields", "name,formatted_address,formatted_phone_number,website,geometry");
      detailsUrl.searchParams.set("key", apiKey);
      try {
        const detailsRes = await fetch(detailsUrl.toString());
        const detailsData = (await detailsRes.json()) as PlaceDetailsResponse;
        const result = detailsData.result;
        const website = result?.website || "";
        const email = website ? await findEmailForWebsite(website) : "";
        return {
          google_place_id: c.place_id,
          business_name: result?.name || c.name,
          category: c.categoryLabel,
          address: result?.formatted_address || c.vicinity || "",
          phone: result?.formatted_phone_number || "",
          website,
          email,
          lat: result?.geometry?.location.lat ?? null,
          lng: result?.geometry?.location.lng ?? null,
        };
      } catch {
        // A single failed Details lookup shouldn't drop the whole search -
        // this result just comes back with the bare minimum from Nearby
        // Search instead of phone/website/email.
        return {
          google_place_id: c.place_id,
          business_name: c.name,
          category: c.categoryLabel,
          address: c.vicinity || "",
          phone: "",
          website: "",
          email: "",
          lat: null,
          lng: null,
        };
      }
    })
  );

  return NextResponse.json({ results: detailed, truncated: candidates.length > boundedCandidates.length });
}
