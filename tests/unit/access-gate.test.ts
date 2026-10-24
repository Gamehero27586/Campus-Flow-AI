import { describe, expect, it } from "vitest";
import { type Area, type GateUser, gate, homeFor } from "@/server/auth/access-gate";

// Step 2 of the pipeline (docs/permissions.md §2) as a table:
// account state x kind of page -> allowed, or where the account is sent.

const noUsername: GateUser = { username: null, status: "pending" };
const pending: GateUser = { username: "sam", status: "pending" };
const active: GateUser = { username: "sam", status: "active" };
const rejected: GateUser = { username: "sam", status: "rejected" };
const deactivated: GateUser = { username: "sam", status: "deactivated" };
// A rejected or deactivated account that never chose a username.
const rejectedNoName: GateUser = { username: null, status: "rejected" };
// An active account without a username cannot normally exist (approval needs one), but the gate must still be safe.
const activeNoName: GateUser = { username: null, status: "active" };

const ALLOW = "allow";

const cases: Array<[string, GateUser | null, Area, string]> = [
  // [label, account, page kind, expected: "allow" or the redirect path]
  ["signed out, sign-in page", null, "public", ALLOW],
  ["signed out, welcome", null, "welcome", "/sign-in"],
  ["signed out, pending page", null, "pending", "/sign-in"],
  ["signed out, app page", null, "app", "/sign-in"],

  ["no username, sign-in page", noUsername, "public", "/welcome"],
  ["no username, welcome", noUsername, "welcome", ALLOW],
  ["no username, pending page", noUsername, "pending", "/welcome"],
  ["no username, app page", noUsername, "app", "/welcome"],

  ["pending, sign-in page", pending, "public", "/pending"],
  ["pending, welcome (allowed by permissions.md)", pending, "welcome", ALLOW],
  ["pending, pending page", pending, "pending", ALLOW],
  ["pending, app page (dashboard)", pending, "app", "/pending"],

  ["active, sign-in page", active, "public", "/dashboard"],
  ["active, welcome", active, "welcome", "/dashboard"],
  ["active, pending page", active, "pending", "/dashboard"],
  ["active, app page", active, "app", ALLOW],

  ["rejected, sign-in page", rejected, "public", "/pending"],
  ["rejected, welcome", rejected, "welcome", "/pending"],
  ["rejected, pending page (shows the message and sign-out)", rejected, "pending", ALLOW],
  ["rejected, app page", rejected, "app", "/pending"],

  ["deactivated, welcome", deactivated, "welcome", "/pending"],
  ["deactivated, pending page", deactivated, "pending", ALLOW],
  ["deactivated, app page", deactivated, "app", "/pending"],

  ["rejected without username, welcome", rejectedNoName, "welcome", "/pending"],
  ["rejected without username, pending page", rejectedNoName, "pending", ALLOW],
  ["rejected without username, app page", rejectedNoName, "app", "/pending"],

  ["active without username, app page", activeNoName, "app", "/welcome"],
];

describe("gate()", () => {
  it.each(cases)("%s", (_label, user, area, expected) => {
    const decision = gate(user, area);
    if (expected === ALLOW) {
      expect(decision).toEqual({ allow: true });
    } else {
      expect(decision).toEqual({ allow: false, redirectTo: expected });
    }
  });
});

describe("homeFor()", () => {
  it.each([
    ["signed out", null, "/sign-in"],
    ["no username", noUsername, "/welcome"],
    ["pending", pending, "/pending"],
    ["active", active, "/dashboard"],
    ["rejected", rejected, "/pending"],
    ["deactivated", deactivated, "/pending"],
    [
      "deactivated without a username",
      { username: null, status: "deactivated" } as GateUser,
      "/pending",
    ],
  ])("%s goes to %s", (_label, user, expected) => {
    expect(homeFor(user)).toBe(expected);
  });
});
