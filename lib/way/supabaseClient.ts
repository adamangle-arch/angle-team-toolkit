import { createClient } from "@supabase/supabase-js";

// A second, independent Supabase project — "The Way" shares no users or
// data with angle-team-toolkit's own lib/supabaseClient.ts, only this
// repo's Next.js/Tailwind scaffolding. Point these at a fresh Supabase
// project (see supabase/the-way-schema.sql for the schema to run there).
const wayUrl = process.env.NEXT_PUBLIC_WAY_SUPABASE_URL;
const wayAnonKey = process.env.NEXT_PUBLIC_WAY_SUPABASE_ANON_KEY;

export const wayConfigured = Boolean(wayUrl && wayAnonKey);

if (!wayConfigured && typeof window !== "undefined") {
  console.error(
    "The Way's Supabase project is not configured. Set NEXT_PUBLIC_WAY_SUPABASE_URL and NEXT_PUBLIC_WAY_SUPABASE_ANON_KEY."
  );
}

export const waySupabase = createClient(
  wayUrl || "https://placeholder.supabase.co",
  wayAnonKey || "placeholder-anon-key"
);
