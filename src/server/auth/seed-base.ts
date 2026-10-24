import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { permissions, rolePermissions, roles } from "@/server/db/schema";
import { PERMISSIONS, ROLE_DEFINITIONS, ROLE_KEYS } from "@/server/auth/permission-keys";

/**
 * Writes the three roles, the 23 permission keys and the default grants (npm run seed:base).
 *
 * Safe to run again. Role and key descriptions are refreshed. Default grants are added only for a
 * key that has no grants at all (a new key), so later edits from the Admin grid are not undone.
 * One consequence: if an Admin removes every grant from a key, running the seed gives the defaults back.
 */
export async function seedBase() {
  return db.transaction(async (tx) => {
    for (const key of ROLE_KEYS) {
      const { name, description } = ROLE_DEFINITIONS[key];
      await tx
        .insert(roles)
        .values({ key, name, description, isSystem: true })
        .onConflictDoUpdate({ target: roles.key, set: { name, description } });
    }

    for (const permission of PERMISSIONS) {
      await tx
        .insert(permissions)
        .values({
          key: permission.key,
          module: permission.module,
          description: permission.description,
        })
        .onConflictDoUpdate({
          target: permissions.key,
          set: { module: permission.module, description: permission.description },
        });
    }

    const roleRows = await tx.select({ id: roles.id, key: roles.key }).from(roles);
    const permissionRows = await tx
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions);
    const roleIdByKey = new Map(roleRows.map((row) => [row.key, row.id]));
    const permissionIdByKey = new Map(permissionRows.map((row) => [row.key, row.id]));

    const alreadyGranted = new Set(
      (
        await tx
          .select({ permissionId: rolePermissions.permissionId })
          .from(rolePermissions)
          .where(
            inArray(
              rolePermissions.permissionId,
              permissionRows.map((row) => row.id),
            ),
          )
      ).map((row) => row.permissionId),
    );

    let grantsAdded = 0;
    for (const permission of PERMISSIONS) {
      const permissionId = permissionIdByKey.get(permission.key)!;
      if (alreadyGranted.has(permissionId)) continue;
      for (const roleKey of permission.defaults) {
        const roleId = roleIdByKey.get(roleKey)!;
        await tx.insert(rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
        grantsAdded += 1;
      }
    }

    return { roles: roleRows.length, permissions: permissionRows.length, grantsAdded };
  });
}
