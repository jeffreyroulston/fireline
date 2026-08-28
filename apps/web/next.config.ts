import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8080";
const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(rootDir, "../.."),
  async rewrites() {
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
