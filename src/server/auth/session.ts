import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/server/auth/better-auth";

// The Better Auth session for this request (cached for the duration of the request only).
// A session proves who is signed in. It never carries status or permissions: those are read
// from the database on every request (CLAUDE.md security rule 7).
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});
