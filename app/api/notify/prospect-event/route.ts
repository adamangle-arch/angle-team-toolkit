import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUsers } from "@/lib/notifyEvent";
import { getToday } from "@/lib/dates";

export const dynamic = "force-dynamic";

type Body =
  | { kind: "prospect_link_visited"; code: string }
  | { kind: "candidate_resource_completed"; code: string; resourceLabel: string };

// Unlike /api/notify, deliberately NOT bearer-token gated - the caller
// here is an anonymous candidate on /prospect, who has no app account or
// session at all. The access code itself is the credential, same trust
// model every other /prospect read/write already uses (see
// get_candidate_by_access_code, toggle_candidate_resource_completion).
export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: candidate } = await admin
    .from("candidates")
    .select("id,name,creator_id,last_visit_notified_on")
    .eq("access_code", body.code.trim().toUpperCase())
    .maybeSingle();
  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  switch (body.kind) {
    case "prospect_link_visited": {
      // At most once per candidate per day - a candidate reopening the
      // page (or leaving the tab open) would otherwise ping their rep on
      // every load, which is noise rather than the "hey, they're
      // actually looking at this" signal this is meant to be.
      const today = getToday();
      if (candidate.last_visit_notified_on === today) {
        return NextResponse.json({ sent: 0, skipped: 1, removed: 0, errors: [] });
      }
      await admin
        .from("candidates")
        .update({ last_visit_notified_on: today })
        .eq("id", candidate.id);

      const result = await notifyUsers({
        userIds: [candidate.creator_id],
        kind: "prospect_link_visited",
        title: "👀 They're checking it out",
        body: `${candidate.name} just opened their resources page`,
        url: "/pipeline",
      });
      return NextResponse.json(result);
    }

    case "candidate_resource_completed": {
      const result = await notifyUsers({
        userIds: [candidate.creator_id],
        kind: "candidate_resource_completed",
        title: "✅ Resource completed",
        body: `${candidate.name} marked "${body.resourceLabel}" as done`,
        url: "/pipeline",
      });
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: "Unknown notification kind" }, { status: 400 });
  }
}
