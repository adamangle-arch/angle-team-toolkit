import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureGoogleConfigured } from "@/lib/googleCalendar";
import { syncOneConnection } from "@/lib/googleCalendarSync";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

// Same sync as the cron route, scoped to just the caller's own
// connection - not admin-gated, since it only ever touches your own
// data. Doubles as the fastest way to confirm the whole pipeline
// actually works right after connecting, instead of waiting up to 5
// minutes for the next cron tick.
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
  const { data: connection } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!connection) {
    return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 400 });
  }

  const result = await syncOneConnection(admin, connection);
  return NextResponse.json(result);
}
