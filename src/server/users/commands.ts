import "server-only";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { fail, ok } from "@/lib/result";
import type { WelcomeInput } from "@/lib/schemas/auth";
import { auth } from "@/server/auth/better-auth";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";

/**
 * The welcome screen: sets the username (once, for good) and the optional requested role.
 *
 * The username goes through Better Auth so its checks run (length, characters, taken, immutable).
 * It is sent together with displayUsername, which keeps the typed capitals for display.
 * The requested role is a hint for the Admin only. Better Auth refuses to write it (input: false),
 * so this command writes it directly.
 */
export async function completeWelcome(
  user: CurrentUser,
  input: WelcomeInput,
  requestHeaders: Headers,
) {
  if (user.username) {
    return fail("already_set", "Your username is already set and cannot be changed.");
  }

  // Role first: it is harmless if the username then fails, and a retry overwrites it.
  await db
    .update(users)
    .set({ requestedRole: input.requestedRole ?? null })
    .where(eq(users.id, user.id));

  try {
    await auth.api.updateUser({
      body: { username: input.username, displayUsername: input.username },
      headers: requestHeaders,
    });
  } catch (error) {
    if (error instanceof APIError) {
      // One message for every refusal: taken, wrong characters, or already set.
      return fail("username_unavailable", "That username can't be used. Try a different one.", {
        username: ["That username can't be used. Try a different one."],
      });
    }
    throw error;
  }

  return ok();
}

/** Time zone is app-owned (input: false), so it is written here and nowhere else. */
export async function updateTimezone(user: CurrentUser, timezone: string) {
  await db.update(users).set({ timezone }).where(eq(users.id, user.id));
  return ok();
}

export async function changePassword(
  input: { currentPassword: string; newPassword: string },
  requestHeaders: Headers,
) {
  try {
    await auth.api.changePassword({
      body: { ...input, revokeOtherSessions: true },
      headers: requestHeaders,
    });
  } catch (error) {
    if (error instanceof APIError) {
      return fail("password_change_failed", "The current password is not correct.", {
        currentPassword: ["The current password is not correct."],
      });
    }
    throw error;
  }
  return ok();
}
