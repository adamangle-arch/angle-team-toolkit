import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { CALL_RATING_TYPES, type CallRatingType } from "@/lib/constants";

// A full 9-section analysis (up to 3000 output tokens, no streaming) on a
// long transcript can take longer than Vercel's default function timeout
// - this raises the ceiling so a legitimately slow-but-working rating
// doesn't get killed mid-generation.
export const maxDuration = 60;

type CallType = CallRatingType;

// Read with literal paths (not a computed lookup) so Next's file tracer can
// see each one individually instead of falling back to tracing the whole
// project into the deployed function bundle - reinforced by explicit
// outputFileTracingIncludes entries in next.config.ts, since the tracer
// missing one of these in the deployed Vercel bundle is exactly what
// caused every single rating attempt to fail outright (a missing file
// throws here, which used to happen at module load time - before the
// request handler's own try/catch could ever run, crashing the function
// before it could respond at all).
//
// Loaded lazily (on first request, then cached) rather than at module
// scope specifically so that failure path now goes through the request
// handler's own try/catch below and returns a real, debuggable JSON
// error instead of taking the whole function down before it can even
// start handling requests.
let ratingPromptsCache: Record<CallType, string> | null = null;

function loadRatingPrompts(): Record<CallType, string> {
  if (!ratingPromptsCache) {
    ratingPromptsCache = {
      QI1: readFileSync(path.join(process.cwd(), "lib/qi1-call-rating-prompt.txt"), "utf-8"),
      QI2: readFileSync(path.join(process.cwd(), "lib/qi2-call-rating-prompt.txt"), "utf-8"),
      FU1: readFileSync(path.join(process.cwd(), "lib/fu1-call-rating-prompt.txt"), "utf-8"),
      FU2: readFileSync(path.join(process.cwd(), "lib/fu2-call-rating-prompt.txt"), "utf-8"),
      Questionnaire: readFileSync(
        path.join(process.cwd(), "lib/questionnaire-call-rating-prompt.txt"),
        "utf-8"
      ),
    };
  }
  return ratingPromptsCache;
}

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

  // The client must say which meeting this is before it gets rated — each
  // stage has a different rubric, since what's covered (and how much
  // explaining is normal) is different at QI1 vs QI2 vs FU1 vs FU2 vs the
  // Questionnaire call.
  const callType = CALL_RATING_TYPES.find((type) => type === body.call_type);
  if (!callType) {
    return NextResponse.json(
      { error: `call_type must be one of: ${CALL_RATING_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // If this candidate has been rated before (or has rep notes on file), that
  // context is passed along so the model "remembers" what came up in earlier
  // meetings with them instead of judging this call in isolation.
  const candidateContext = body.candidate_context?.trim();
  const userContent = candidateContext
    ? `Context on this candidate from prior meetings and the rep's notes:\n${candidateContext}\n\n---\n\nNew call transcript to analyze:\n\n${transcript}`
    : transcript;

  let ratingPrompts: Record<CallType, string>;
  try {
    ratingPrompts = loadRatingPrompts();
  } catch (err) {
    console.error("Failed to load rating rubric files", err);
    return NextResponse.json(
      { error: "The rating rubrics aren't available on the server right now." },
      { status: 500 }
    );
  }

  try {
    // A very short transcript (a call's tail end, a couple of exchanges)
    // combined with a rubric that demands detailed, specific evidence
    // across 9 sections is a real edge case for the model producing a
    // blank or near-blank completion - it's happened intermittently with
    // the exact same input succeeding on one attempt and not another. One
    // automatic retry covers that transient case before actually failing.
    //
    // A full, non-streamed 9-section analysis can legitimately take
    // 20-40+ seconds on its own, and this retry loop can trigger a second
    // one - two of those back to back risks blowing past this route's
    // maxDuration (60s), which kills the function mid-generation with no
    // HTTP response at all. From the client that's indistinguishable from
    // a dropped connection ("Load failed"), not a clean error message. If
    // the first attempt already ate most of the time budget, skip the
    // retry and fail fast with a real error instead of risking that.
    const startedAt = Date.now();
    const RETRY_TIME_BUDGET_MS = 40_000;
    let analysis = "";
    for (
      let attempt = 0;
      attempt < 2 && !analysis && (attempt === 0 || Date.now() - startedAt < RETRY_TIME_BUDGET_MS);
      attempt++
    ) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 3000,
        system: [
          {
            type: "text",
            text: ratingPrompts[callType],
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      });

      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      analysis = textBlock?.text.trim() ?? "";
    }

    // A blank rating is worse than no rating - it silently gets saved and
    // looks like a real entry with nothing in it and no way to tell why.
    // Treat this the same as any other failure instead of returning it as
    // if it succeeded.
    if (!analysis) {
      return NextResponse.json(
        {
          error:
            "The assistant couldn't produce a rating for this transcript, even after retrying. If this is a short excerpt rather than the full call, try pasting the complete transcript.",
        },
        { status: 502 }
      );
    }

    // Primary: the exact "OVERALL_SCORE: X/10" line the prompts ask for.
    // Fallback: every rubric's section 1 states the score as "X/10" near
    // the very start regardless, in case the model paraphrases the exact
    // line format.
    const primaryMatch = /OVERALL[_\s]SCORE:?\s*(\d+(?:\.\d+)?)\s*\/\s*10/i.exec(analysis);
    const fallbackMatch = primaryMatch
      ? null
      : /(\d+(?:\.\d+)?)\s*\/\s*10\b/.exec(analysis.slice(0, 400));
    const overallScore = primaryMatch
      ? parseFloat(primaryMatch[1])
      : fallbackMatch
        ? parseFloat(fallbackMatch[1])
        : null;

    return NextResponse.json({ analysis, overall_score: overallScore });
  } catch (error) {
    console.error("Anthropic API error", error);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
