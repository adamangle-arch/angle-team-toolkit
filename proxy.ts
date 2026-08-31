import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Lets this exact codebase also serve as a fully separate deployment for
// "The Way" — its own Vercel project, its own domain — without touching
// the Angle Team Toolkit deployment at all. Set WAY_STANDALONE=true only
// on that second project's environment variables; everywhere else
// (including the main angle-team-toolkit deployment) this is a no-op.
//
// Browsers (iOS Safari's "Add to Home Screen" especially) don't reliably
// read the current page's own <link rel="apple-touch-icon"> tag — they
// often fetch a handful of well-known root-level paths directly, no
// matter what page you're actually on. Those root paths are Angle Team
// Toolkit's real files (app/icon.tsx doesn't exist there; it's static
// files in /public), so on the-way's own domain they need to be rewritten
// to The Way's own icon routes instead, or every browser's icon probe
// picks up the wrong app's branding regardless of which page loaded.
const ICON_REWRITES: Record<string, string> = {
  "/apple-touch-icon.png": "/the-way/apple-icon",
  "/apple-touch-icon-precomposed.png": "/the-way/apple-icon",
  "/icon-512.png": "/the-way/icon",
  "/favicon.ico": "/the-way/icon",
  // Same story as the icons above: app/manifest.ts only exists at the
  // app root (Next.js has no per-segment manifest convention), so the
  // root's Angle Team Toolkit manifest - and its "Angle Team" short_name -
  // is what browsers fetch from /manifest.webmanifest regardless of page.
  "/manifest.webmanifest": "/the-way/manifest.webmanifest",
};

export function proxy(request: NextRequest) {
  if (process.env.WAY_STANDALONE !== "true") return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/the-way", request.url));
  }

  const rewriteTo = ICON_REWRITES[pathname];
  if (rewriteTo) {
    return NextResponse.rewrite(new URL(rewriteTo, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
    "/icon-512.png",
    "/favicon.ico",
    "/manifest.webmanifest",
  ],
};
