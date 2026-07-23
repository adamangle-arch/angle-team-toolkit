import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/assistant": ["./lib/angle-team-system-prompt.txt"],
  },
};

export default nextConfig;
