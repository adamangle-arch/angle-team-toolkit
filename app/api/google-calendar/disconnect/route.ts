import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { revokeToken } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

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

  const admin = getSupabaseAdmin();
  const { data: connection } = await admin
    .from("google_calendar_connections")
    .select("refresh_token")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (connection?.refresh_token) {
    await revokeToken(connection.refresh_token);
  }

  const { error } = await admin
    .from("google_calendar_connections")
    .delete()
    .eq("user_id", userData.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stale links would otherwise look "already synced" to a future
  // reconnect even if it's a different Google account entirely, causing
  // push updates to target event ids that belong to the old account.
  await admin.from("calendar_event_google_links").delete().eq("connection_user_id", userData.user.id);
  await admin.from("calendar_google_pending_deletes").delete().eq("connection_user_id", userData.user.id);

  return NextResponse.json({ ok: true });
}
