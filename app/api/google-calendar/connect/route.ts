import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureGoogleConfigured, buildAuthUrl } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

// Kicks off the OAuth round-trip: verifies the caller (same bearer-token
// pattern as every other authed route), stashes a short-lived state row
// so the callback below - which Google hits directly, with no
// Authorization header this app controls - can recover which user
// started this, then hands back the URL to send the browser to.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    ensureGoogleConfigured();
  } catch {
    return NextResponse.json(
      { error: "Google Calendar sync is not configured on the server." },
      { status: 500 }
    );
  }

  const admin = getSupabaseAdmin();
  const state = crypto.randomUUID();
  const { error: insertError } = await admin
    .from("google_oauth_states")
    .insert({ state, user_id: userData.user.id });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Best-effort cleanup of anyone else's abandoned attempts - not load-
  // bearing (an expired state is just rejected in the callback below
  // regardless), just keeps the table from growing unbounded.
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  admin.from("google_oauth_states").delete().lt("created_at", tenMinutesAgo).then(() => {});

  const redirectUri = `${new URL(request.url).origin}/api/google-calendar/callback`;
  return NextResponse.json({ authUrl: buildAuthUrl(state, redirectUri) });
}
