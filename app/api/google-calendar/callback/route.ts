import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { exchangeCodeForTokens, fetchGoogleEmail } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

// Google redirects the browser here directly - there's no Authorization
// header this app controls on this request, which is exactly why /connect
// above stashed a state row first: it's how this route recovers which
// user actually started the flow.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const calendarUrl = new URL("/calendar", url.origin);

  if (!code || !state) {
    // Either an explicit denial on Google's consent screen, or a
    // malformed callback - either way there's nothing to recover here.
    calendarUrl.searchParams.set("google", "denied");
    return NextResponse.redirect(calendarUrl);
  }

  const admin = getSupabaseAdmin();
  const { data: stateRow } = await admin
    .from("google_oauth_states")
    .select("user_id, created_at")
    .eq("state", state)
    .maybeSingle();

  if (!stateRow || Date.now() - new Date(stateRow.created_at).getTime() > 10 * 60 * 1000) {
    calendarUrl.searchParams.set("google", "expired");
    return NextResponse.redirect(calendarUrl);
  }
  // Single-use - whether or not the exchange below succeeds, this state
  // value is spent.
  await admin.from("google_oauth_states").delete().eq("state", state);

  try {
    const redirectUri = `${url.origin}/api/google-calendar/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const googleEmail = await fetchGoogleEmail(tokens.access_token);

    // Google only returns refresh_token on the consent grant that
    // actually issues one (prompt=consent above should guarantee this on
    // every connect, but falling back to keeping whatever's already
    // stored is cheap insurance against a reconnect somehow omitting it).
    const { data: existing } = await admin
      .from("google_calendar_connections")
      .select("refresh_token")
      .eq("user_id", stateRow.user_id)
      .maybeSingle();
    const refreshToken = tokens.refresh_token ?? existing?.refresh_token;
    if (!refreshToken) {
      calendarUrl.searchParams.set("google", "error");
      return NextResponse.redirect(calendarUrl);
    }

    const { error } = await admin.from("google_calendar_connections").upsert({
      user_id: stateRow.user_id,
      google_email: googleEmail,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      // A reconnect starts the sync cursor over - simpler and safer than
      // trying to keep a stale syncToken from a previous, possibly-
      // revoked grant.
      sync_token: null,
      last_synced_at: null,
    });
    if (error) throw error;

    calendarUrl.searchParams.set("google", "connected");
    return NextResponse.redirect(calendarUrl);
  } catch {
    calendarUrl.searchParams.set("google", "error");
    return NextResponse.redirect(calendarUrl);
  }
}
