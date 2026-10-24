import "server-only";
import { and, eq } from "drizzle-orm";
import { now } from "@/lib/time";
import { fail, ok } from "@/lib/result";
import { writeAudit } from "@/server/audit/write-audit";
import { db } from "@/server/db/client";
import { roles, users } from "@/server/db/schema";

/**
 * Makes the owner the first Admin (npm run admin:promote -- <email>).
 *
 * This is the only way anyone becomes Admin without another Admin: no runtime code path calls it
 * (CLAUDE.md security rule 11). It refuses if an active Admin already exists, so it cannot be used
 * later to take over the system, and it writes an audit row in the same transaction.
 */
export async function promoteFirstAdmin(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();

  return db.transaction(async (tx) => {
    const [adminRole] = await tx.select().from(roles).where(eq(roles.key, "admin"));
    if (!adminRole) {
      return fail("roles_missing", "The roles are not seeded yet. Run npm run seed:base first.");
    }

    const [existingAdmin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.roleId, adminRole.id), eq(users.status, "active")))
      .limit(1);
    if (existingAdmin) {
      return fail("admin_exists", "An active Admin already exists. Nothing was changed.");
    }

    const [target] = await tx.select().from(users).where(eq(users.email, email));
    if (!target) {
      return fail("user_not_found", "No account has that email. Sign up in the app first.");
    }

    await tx
      .update(users)
      .set({
        roleId: adminRole.id,
        status: "active",
        approvedBy: target.id,
        approvedAt: now(),
        rejectionReason: null,
      })
      .where(eq(users.id, target.id));

    await writeAudit(tx, {
      actorId: target.id,
      action: "user.promoted_to_admin",
      targetType: "user",
      targetId: target.id,
      details: { via: "admin:promote", email },
    });

    return ok({ userId: target.id, email });
  });
}
