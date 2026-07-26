import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const QI1_RATING_PROMPT = readFileSync(
  path.join(process.cwd(), "lib/qi1-call-rating-prompt.txt"),
  "utf-8"
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
);

// ~15k tokens of transcript at a rough 4 chars/token, enough headroom for
// a long QI1 call plus the rubric and the write-up itself.
const MAX_TRANSCRIPT_CHARS = 60000;

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

  let body: { call_type?: string; transcript?: string; candidate_context?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const transcript = body.transcript?.trim();
  if (!transcript) {
    return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return NextResponse.json(
      {
        error: `That transcript is too long (max ${MAX_TRANSCRIPT_CHARS.toLocaleString()} characters).`,
      },
      { status: 400 }
    );
  }

  // Only QI1 has a rubric so far — QI2 needs its own before it can be rated.
  if (body.call_type !== "QI1") {
    return NextResponse.json({ error: "QI2 rating isn't available yet." }, { status: 400 });
  }

  // If this candidate has been rated before (or has rep notes on file), that
  // context is passed along so the model "remembers" what came up in earlier
  // meetings with them instead of judging this call in isolation.
  const candidateContext = body.candidate_context?.trim();
  const userContent = candidateContext
    ? `Context on this candidate from prior meetings and the rep's notes:\n${candidateContext}\n\n---\n\nNew call transcript to analyze:\n\n${transcript}`
    : transcript;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: QI1_RATING_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    const analysis = textBlock?.text ?? "";
    const scoreMatch = /OVERALL_SCORE:\s*(\d+(?:\.\d+)?)/i.exec(analysis);
    const overallScore = scoreMatch ? parseFloat(scoreMatch[1]) : null;

    return NextResponse.json({ analysis, overall_score: overallScore });
  } catch (error) {
    console.error("Anthropic API error", error);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
