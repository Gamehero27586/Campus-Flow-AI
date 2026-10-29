import type { NextConfig } from "next";

// Trying the app on a phone over the home Wi-Fi (DEV_ALLOW_LAN=yes in .env.local, `npm run dev` only):
// Next.js refuses to serve its dev scripts to any host other than localhost unless it is listed here, and
// the page would load but nothing would work. These are the private network ranges, written one label per
// `*` (in Next.js a `*` is exactly one label, so "192.168.*.*" cannot match a domain name). The address of
// this computer changes now and then, so a range is listed, not one address. Ignored in a production build.
const lanDevOrigins =
  process.env.DEV_ALLOW_LAN === "yes" && process.env.NODE_ENV !== "production"
    ? [
        "192.168.*.*",
        "10.*.*.*",
        ...Array.from({ length: 16 }, (_, index) => `172.${16 + index}.*.*`),
      ]
    : [];

// cacheComponents and partialPrefetching are off on purpose (docs/decisions.md §16):
// every page here reads the signed-in user, so rendering is per request.
const nextConfig: NextConfig = {
  allowedDevOrigins: lanDevOrigins,
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
