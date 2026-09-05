import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local `next dev` against the Docker stack: API_ORIGIN=http://127.0.0.1/api
// Full local api (`pnpm dev:api` on :8080): default below.
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8080";
const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  basePath: "/solver",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.gatcg.com",
      },
    ],
  },
  output: "standalone",
  outputFileTracingRoot: path.join(rootDir, "../.."),
  async rewrites() {
    // With basePath "/solver", this source matches browser requests to /solver/api/*.
    // External destinations are not prefixed.
    return {
      afterFiles: [
        // Proxy API before workbench dynamic routes, but leave run SSE on the
        // local route handler — afterFiles rewrites buffer streams and would
        // stall progress until the run finishes.
        {
          source: "/api/:path((?!runs/[^/]+/events$).*)",
          destination: `${apiOrigin}/:path`,
        },
      ],
    };
  },
};

export default nextConfig;
