import "server-only";
import { and, eq } from "drizzle-orm";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { account } from "@/server/db/schema";

async function hasLoginMethod(user: CurrentUser, providerId: "credential" | "google") {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, user.id), eq(account.providerId, providerId)))
    .limit(1);
  return rows.length > 0;
}

/** Does this account sign in with a password? (Google-only accounts have none.) */
export function hasPasswordLogin(user: CurrentUser): Promise<boolean> {
  return hasLoginMethod(user, "credential");
}

/** Is a Google account connected to this account? */
export function hasGoogleLogin(user: CurrentUser): Promise<boolean> {
  return hasLoginMethod(user, "google");
}
