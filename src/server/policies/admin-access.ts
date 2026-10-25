import "server-only";

// What Admin may do with records that belong to other people (docs/permissions.md §5). One place,
// so the three privacy tiers cannot be interpreted differently in different domains.
//
//   personal  tier 1: personal tasks and subtasks, subtasks of assignment tasks, the personal Growth
//             Tracker, AI suggestions. Owner only. Admin never sees them.
//   academic  tier 2: classes, rosters, codes, assignments, submissions, files, grades, class trackers.
//             Admin may read them (through admin.override).
//   team      tier 3: teams and team tasks. Admin may read them (through admin.override).
//
// Admin's only writes outside the Admin module are the two transfers.

export type RecordTier = "personal" | "academic" | "team";

export const ADMIN_WRITE_ACTIONS = ["class.transfer_ownership", "team.transfer_creator"] as const;
export type AdminWriteAction = (typeof ADMIN_WRITE_ACTIONS)[number];

const OVERRIDE_KEY = "admin.override";

/** May the holder of these permissions read a record of this tier that is not theirs? */
export function adminMayRead(permissions: ReadonlySet<string>, tier: RecordTier): boolean {
  if (tier === "personal") return false; // No permission key can ever grant this (permissions.md §1 rule 4).
  return permissions.has(OVERRIDE_KEY);
}

/** May the holder of these permissions perform this write on someone else's record? */
export function adminMayWrite(permissions: ReadonlySet<string>, action: AdminWriteAction): boolean {
  return (
    permissions.has(OVERRIDE_KEY) && (ADMIN_WRITE_ACTIONS as readonly string[]).includes(action)
  );
}
