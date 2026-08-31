import { NextResponse } from "next/server";
import type { MetadataRoute } from "next";

// app/manifest.ts is a root-only Next.js convention (no per-segment
// version, unlike icon.tsx) - this is a plain Route Handler standing in
// for one, so The Way can have its own name/short_name/colors instead of
// inheriting Angle Team Toolkit's root manifest. proxy.ts rewrites
// /manifest.webmanifest to this route on the-way's own domain.
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    name: "The Way",
    short_name: "The Way",
    description: "A discipleship course platform.",
    start_url: "/the-way",
    display: "standalone",
    background_color: "#1a1625",
    theme_color: "#1a1625",
    icons: [
      { src: "/the-way/icon", sizes: "64x64", type: "image/png" },
      { src: "/the-way/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
