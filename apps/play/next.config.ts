import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local `next dev` against the Docker stack: API is only on the Caddy proxy (:80).
// Full local api (`pnpm dev:api` on :8080): API_ORIGIN=http://127.0.0.1:8080
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1/api";
const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  basePath: "/play",
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
    // With basePath "/play", this source matches browser requests to /play/api/*.
    // External destinations are not prefixed.
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${apiOrigin}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
