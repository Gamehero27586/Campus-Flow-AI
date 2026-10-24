import { pgEnum } from "drizzle-orm/pg-core";

// Enums are defined once here and reused by the Zod schemas (docs/folder-structure.md §4).

export const USER_STATUSES = ["pending", "active", "rejected", "deactivated"] as const;
export const userStatusEnum = pgEnum("user_status", USER_STATUSES);

export const REQUESTED_ROLES = ["student", "faculty"] as const;
export const requestedRoleEnum = pgEnum("requested_role", REQUESTED_ROLES);
