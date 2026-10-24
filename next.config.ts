import type { NextConfig } from "next";

// cacheComponents and partialPrefetching are off on purpose (docs/decisions.md §16):
// every page here reads the signed-in user, so rendering is per request.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
