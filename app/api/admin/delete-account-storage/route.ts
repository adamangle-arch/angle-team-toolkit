import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isPrimaryUser } from "@/lib/constants";

export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

// delete_downline_account() deletes from auth.users, which cascades
// through every DB row referencing that user - but Storage objects
// aren't rows in a table Postgres knows about, so a deleted person's
// avatar and story photos stayed in the (public) avatars/story-photos
// buckets forever, still reachable by direct URL, with nothing in the
// app pointing at them anymore. Called from Team's delete flow as a
// best-effort side step alongside the actual account-deletion RPC.
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
  const callerId = userData.user.id;
  const callerEmail = userData.user.email;

  let body: { targetUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const targetUserId = body.targetUserId;
  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  if (!isPrimaryUser(callerEmail)) {
    const { data: isUpline } = await admin.rpc("is_upline_of", {
      p_viewer: callerId,
      p_target: targetUserId,
    });
    if (!isUpline) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const removed: string[] = [];
  const errors: string[] = [];
  for (const bucket of ["avatars", "story-photos"] as const) {
    const { data: files, error: listError } = await admin.storage.from(bucket).list(targetUserId);
    if (listError) {
      errors.push(`${bucket}: ${listError.message}`);
      continue;
    }
    if (!files || files.length === 0) continue;
    const paths = files.map((f) => `${targetUserId}/${f.name}`);
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) {
      errors.push(`${bucket}: ${removeError.message}`);
    } else {
      removed.push(...paths);
    }
  }

  return NextResponse.json({ removed, errors });
}
