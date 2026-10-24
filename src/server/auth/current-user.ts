import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { roles, users } from "@/server/db/schema";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  displayUsername: string | null;
  status: "pending" | "active" | "rejected" | "deactivated";
  requestedRole: "student" | "faculty" | null;
  roleId: string | null;
  roleKey: string | null;
  timezone: string;
  rejectionReason: string | null;
};

/** Loads the signed-in user's fresh account row. Returns null when nobody is signed in. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      username: users.username,
      displayUsername: users.displayUsername,
      status: users.status,
      requestedRole: users.requestedRole,
      roleId: users.roleId,
      roleKey: roles.key,
      timezone: users.timezone,
      rejectionReason: users.rejectionReason,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, session.user.id));

  // A valid session whose user row is gone: treat as signed out.
  return row ?? null;
});
