import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const SYSTEM_PROMPT = readFileSync(
  path.join(process.cwd(), "lib/angle-team-system-prompt.txt"),
  "utf-8"
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

const MAX_HISTORY_MESSAGES = 20;

// This endpoint calls a paid Anthropic API with no cost cap otherwise - a
// scripted loop (or one very chatty user) could run up real spend with
// nothing to stop it. Logged into assistant_api_calls by this route
// itself, before the Anthropic call, via the service-role client - so the
// count can't be dodged by hitting this endpoint directly instead of
// going through the chat UI. Two windows: a short one to stop a tight
// retry loop, a daily one to cap sustained abuse, both generous enough
// that no real conversation should ever hit them.
const BURST_WINDOW_MS = 60_000;
const BURST_MAX_CALLS = 8;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAILY_MAX_CALLS = 150;

async function checkRateLimit(userId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const now = Date.now();

  const [{ count: burstCount }, { count: dailyCount }] = await Promise.all([
    admin
      .from("assistant_api_calls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", new Date(now - BURST_WINDOW_MS).toISOString()),
    admin
      .from("assistant_api_calls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", new Date(now - DAILY_WINDOW_MS).toISOString()),
  ]);

  if ((burstCount ?? 0) >= BURST_MAX_CALLS) {
    return "You're sending messages faster than the assistant can keep up — give it a few seconds and try again.";
  }
  if ((dailyCount ?? 0) >= DAILY_MAX_CALLS) {
    return "You've hit today's limit for assistant messages. It resets on a rolling 24-hour basis — try again a bit later.";
  }
  return null;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function parseImageDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const [, mediaType, data] = match;
  if (!ALLOWED_IMAGE_TYPES.has(mediaType)) return null;
  return { mediaType, data };
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

  const rateLimitMessage = await checkRateLimit(userData.user.id);
  if (rateLimitMessage) {
    return NextResponse.json({ error: rateLimitMessage }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let body: {
    messages?: { role: string; content: string; image_data?: string | null }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => {
    const role = m.role === "assistant" ? ("assistant" as const) : ("user" as const);
    const image = m.image_data ? parseImageDataUrl(m.image_data) : null;

    if (!image) {
      return { role, content: m.content };
    }

    return {
      role,
      content: [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: image.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: image.data,
          },
        },
        ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
      ],
    };
  });

  // Logged before the Anthropic call so a request that's mid-flight when
  // the next one lands still counts toward the burst/daily caps above.
  // Best-effort: a logging failure shouldn't block a real reply, just
  // means this one call didn't count against the caps.
  const { error: rateLimitLogError } = await getSupabaseAdmin()
    .from("assistant_api_calls")
    .insert({ user_id: userData.user.id });
  if (rateLimitLogError) {
    console.error("Failed to log assistant_api_calls row", rateLimitLogError);
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: recentMessages,
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    const reply = textBlock?.text.trim();

    return NextResponse.json({
      reply: reply || "Didn't catch a clear reply there — try rephrasing, or send it again.",
    });
  } catch (error) {
    console.error("Anthropic API error", error);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
