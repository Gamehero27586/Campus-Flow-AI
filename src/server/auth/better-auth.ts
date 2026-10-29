import "server-only";
import { env } from "@/env";
import { createAuth } from "@/server/auth/create-auth";
import { lanTrustedOrigins } from "@/server/auth/lan-origins";
import { db } from "@/server/db/client";

export const auth = createAuth(db, {
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // Development only (src/env.ts refuses DEV_ALLOW_LAN in production): trust a request from a private
  // network address, so a phone on the home Wi-Fi can sign in. Nothing else is added.
  trustedOrigins: env.DEV_ALLOW_LAN === "yes" ? lanTrustedOrigins : undefined,
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
      : undefined,
});
