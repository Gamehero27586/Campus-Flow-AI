import type { CurrentUser } from "@/server/auth/current-user";
import { PERMISSIONS, type RoleKey } from "@/server/auth/permission-keys";

// Fixtures for the table-driven permission tests (docs/permissions.md §9).
// An "acting user type" is a CurrentUser plus the permission keys their role holds.
// Add a type here once, and every table can use it.

export type ActingUserType =
  | "signed out"
  | "no username yet"
  | "pending"
  | "rejected"
  | "deactivated"
  | "student"
  | "faculty"
  | "admin";

export type Actor = { user: CurrentUser | null; permissions: ReadonlySet<string> };

/** The keys a role is granted by default (the seed), read from the code's definitions. */
export function defaultKeysFor(role: RoleKey): ReadonlySet<string> {
  return new Set(
    PERMISSIONS.filter((permission) =>
      (permission.defaults as readonly string[]).includes(role),
    ).map((permission) => permission.key),
  );
}

export function makeUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Test Person",
    email: "person@example.test",
    emailVerified: true,
    username: "person",
    displayUsername: "Person",
    status: "active",
    requestedRole: null,
    roleId: "role-id",
    roleKey: "student",
    timezone: "Asia/Kolkata",
    rejectionReason: null,
    ...overrides,
  };
}

/**
 * Every acting user type. Rejected and deactivated users keep their role in the database, so they
 * still hold their keys: the point of the tests is that account status (step 2) stops them anyway.
 */
export function actor(type: ActingUserType): Actor {
  switch (type) {
    case "signed out":
      return { user: null, permissions: new Set() };
    case "no username yet":
      return {
        user: makeUser({
          status: "pending",
          username: null,
          displayUsername: null,
          roleId: null,
          roleKey: null,
        }),
        permissions: new Set(),
      };
    case "pending":
      return {
        user: makeUser({ status: "pending", roleId: null, roleKey: null }),
        permissions: new Set(),
      };
    case "rejected":
      return {
        user: makeUser({ status: "rejected", rejectionReason: "Not approved" }),
        permissions: defaultKeysFor("student"),
      };
    case "deactivated":
      return { user: makeUser({ status: "deactivated" }), permissions: defaultKeysFor("student") };
    case "student":
      return { user: makeUser({ roleKey: "student" }), permissions: defaultKeysFor("student") };
    case "faculty":
      return { user: makeUser({ roleKey: "faculty" }), permissions: defaultKeysFor("faculty") };
    case "admin":
      return { user: makeUser({ roleKey: "admin" }), permissions: defaultKeysFor("admin") };
  }
}

export const ALL_ACTING_USER_TYPES: ActingUserType[] = [
  "signed out",
  "no username yet",
  "pending",
  "rejected",
  "deactivated",
  "student",
  "faculty",
  "admin",
];
