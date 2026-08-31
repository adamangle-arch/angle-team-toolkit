import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Lets this exact codebase also serve as a fully separate deployment for
// "The Way" — its own Vercel project, its own domain — without touching
// the Angle Team Toolkit deployment at all. Set WAY_STANDALONE=true only
// on that second project's environment variables; everywhere else
// (including the main angle-team-toolkit deployment) this is a no-op and
// "/" keeps redirecting to /leaderboard as it always has.
export function middleware(request: NextRequest) {
  if (process.env.WAY_STANDALONE === "true" && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/the-way", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
