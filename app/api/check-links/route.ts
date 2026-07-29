import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

type CheckResult = { url: string; ok: boolean; status: number | null; error?: string };

// Checking whether a resource's link still works has to happen server
// -side, not from the browser - a client-side fetch to a random
// Dropbox/PDF-mirror/YouTube URL almost always gets blocked by CORS
// regardless of whether the link is actually still good, so the
// result would be meaningless. A Vercel serverless function has no
// such restriction (CORS is a browser concept), so it can just ask
// each host directly the same way curl would.
async function checkOne(url: string): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AngleTeamToolkit-LinkCheck/1.0)" },
    });
    // Only need the status - cancel the body so a large audio/PDF file
    // doesn't actually get downloaded in full.
    res.body?.cancel();
    return { url, ok: res.ok, status: res.status };
  } catch (err) {
    return { url, ok: false, status: null, error: err instanceof Error ? err.message : "Request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

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

  const body = await request.json();
  const urls = Array.isArray(body?.urls) ? (body.urls as unknown[]).filter((u): u is string => typeof u === "string") : [];
  if (urls.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results = await Promise.all(urls.map(checkOne));
  return NextResponse.json({ results });
}
