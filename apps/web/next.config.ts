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
      fallback: [
        {
          source: "/api/:path*",
          destination: `${apiOrigin}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
