import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/assistant": ["./lib/angle-team-system-prompt.txt"],
    // rate-call reads five rubric files with readFileSync at module load
    // time - none of these were declared here, so Vercel's automatic
    // file tracer (which doesn't reliably follow a computed
    // path.join(process.cwd(), ...) call) very likely left all five out
    // of the deployed function bundle. A missing file throws at module
    // init, before the route handler's own try/catch can run - crashing
    // the function before it ever responds, which is exactly what a
    // client sees as a dropped connection ("Load failed"/"Lost
    // connection") rather than a clean error message, and does so on
    // every single attempt rather than intermittently.
    "/api/assistant/rate-call": [
      "./lib/qi1-call-rating-prompt.txt",
      "./lib/qi2-call-rating-prompt.txt",
      "./lib/fu1-call-rating-prompt.txt",
      "./lib/fu2-call-rating-prompt.txt",
      "./lib/questionnaire-call-rating-prompt.txt",
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
