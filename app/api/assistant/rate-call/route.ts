import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { CALL_RATING_TYPES, type CallRatingType } from "@/lib/constants";

// A full 9-section analysis plus scorecard on a long transcript can take
// longer than Vercel's default function timeout - this raises the ceiling,
// and the streaming + soft-deadline logic below stays well under it so a
// legitimately slow rating still gets a real response instead of getting
// killed mid-generation.
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
    // The actual root cause of "cuts off"/"Load failed" on a genuinely
    // long, rich (e.g. ~30 minute) transcript: a full 9-section write-up
    // plus 10-dimension scorecard for a substantial call can legitimately
    // need more tokens - and therefore more wall-clock time - than this
    // route's maxDuration (60s) allows for a single blocking, non-streamed
    // call. When Vercel kills a function mid-generation, the client gets
    // no HTTP response at all - just a dropped connection, which browsers
    // report in confusingly different ways ("Load failed" on Safari, or a
    // native "The string did not match the expected pattern" SyntaxError
    // when the client's `res.json()` chokes on the platform's own
    // non-JSON timeout page instead of our JSON).
    //
    // Streaming fixes this properly: text arrives incrementally, so if a
    // soft deadline (well under maxDuration, leaving buffer for the
    // Supabase save and response serialization) is hit, the function can
    // still abort cleanly and return whatever was generated so far as a
    // real, valid JSON response - instead of getting killed by the
    // platform with nothing to show for it. A partial analysis with a
    // clear "cut short" note beats no response at all.
    const SOFT_DEADLINE_MS = 48_000;
    // Re-bound so TS carries the non-undefined type into the closure below
    // - narrowing from the `if (!callType) return` guard above doesn't
    // persist into a nested function body even though callType is const.
    const rubric = ratingPrompts[callType];

    async function attempt(): Promise<{ analysis: string; stopReason: string | null; truncated: boolean }> {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-5",
        max_tokens: 8000,
        system: [
          {
            type: "text",
            text: rubric,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      });

      let text = "";
      stream.on("text", (delta) => {
        text += delta;
      });

      // stream.done() rejects if the stream errors or gets aborted - which
      // it always will on the losing side of this race once the deadline
      // branch below calls stream.abort(). Promise.race doesn't attach a
      // rejection handler to the side it didn't pick, so that abandoned
      // rejection was surfacing as a genuinely unhandled promise
      // rejection in the middle of an in-flight Vercel function - which
      // can tear down the response before it's ever sent, reproducing the
      // exact "killed mid-request" failure this streaming rewrite was
      // supposed to fix. Attaching .catch() here, at the source, makes
      // that rejection always handled regardless of which side of the
      // race actually settles it.
      const donePromise = stream.done().then(
        () => false,
        () => false
      );

      const timedOut = await Promise.race([
        donePromise,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), SOFT_DEADLINE_MS)),
      ]);

      if (timedOut) {
        stream.abort();
        return { analysis: text.trim(), stopReason: "deadline", truncated: true };
      }

      const final = await stream.finalMessage();
      return { analysis: text.trim(), stopReason: final.stop_reason, truncated: false };
    }

    const { analysis: rawAnalysis, stopReason, truncated } = await attempt();

    console.log("rate-call result", {
      callType,
      transcriptChars: transcript.length,
      stopReason,
      truncated,
      analysisChars: rawAnalysis.length,
    });

    // A blank rating is worse than no rating - it silently gets saved and
    // looks like a real entry with nothing in it and no way to tell why.
    // Treat this the same as any other failure instead of returning it as
    // if it succeeded. (Genuinely zero characters streamed before even
    // the soft deadline is an extreme edge case, not the normal "cut
    // short" case handled below.)
    if (!rawAnalysis) {
      console.error("rate-call: blank completion", {
        callType,
        transcriptChars: transcript.length,
        stopReason,
      });
      return NextResponse.json(
        {
          error: `The assistant couldn't produce a rating for this transcript (reason: ${stopReason ?? "unknown"}). Please try again — if it keeps happening, let the team know it recurred so it can be tracked down.`,
        },
        { status: 502 }
      );
    }

    const analysis = truncated
      ? `${rawAnalysis}\n\n_(This call was long enough that the full write-up didn't finish in time — the analysis above is real but may cut off before the last section. Try rating it again if you need the complete version.)_`
      : rawAnalysis;

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
