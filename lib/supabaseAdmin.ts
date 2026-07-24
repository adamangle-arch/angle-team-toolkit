import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. Server-only: never import
// this from a client component, and never expose SUPABASE_SERVICE_ROLE_KEY
// with a NEXT_PUBLIC_ prefix. Only used by the cron-triggered push route,
// which needs to read across every user's streak/subscription rows.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role is not configured on the server.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
