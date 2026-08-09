import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureGoogleConfigured } from "@/lib/googleCalendar";
import { syncOneConnection } from "@/lib/googleCalendarSync";

export const dynamic = "force-dynamic";

// Cron-triggered (a Supabase pg_cron job, same reasoning and pattern as
// send-calendar-reminders - Vercel Hobby's two cron slots are already
// spent, and this needs finer granularity than once a day anyway) sweep
// of every connected account.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
  const { data: connections } = await admin.from("google_calendar_connections").select("*");

  const results: { user_id: string; pulled: number; pushed: number; deletedLocally: number; errors: string[] }[] = [];
  for (const connection of connections ?? []) {
    const result = await syncOneConnection(admin, connection);
    results.push({ user_id: connection.user_id, ...result });
  }

  return NextResponse.json({ connections: results.length, results });
}
