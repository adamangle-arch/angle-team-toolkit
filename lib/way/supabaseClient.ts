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

// Where "Forgot password?" emails link to (see WayAuthGate).
export const WAY_RESET_PASSWORD_PATH = "/the-way/reset-password";

// Captured before createClient below, because supabase-js parses the
// recovery token out of the URL hash and then clears it. That parse fires
// PASSWORD_RECOVERY before any component can subscribe. The reset link
// normally lands on /the-way/reset-password; this also catches one that
// Supabase sent to its Site URL instead (a redirect URL that isn't
// allow-listed).
export const wayArrivedFromRecoveryLink =
  typeof window !== "undefined" && /[#&]type=recovery(&|$)/.test(window.location.hash);

export const waySupabase = createClient(
  wayUrl || "https://placeholder.supabase.co",
  wayAnonKey || "placeholder-anon-key"
);
