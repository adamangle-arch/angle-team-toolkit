import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

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

    return NextResponse.json({ reply: textBlock?.text ?? "" });
  } catch (error) {
    console.error("Anthropic API error", error);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
