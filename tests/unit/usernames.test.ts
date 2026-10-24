import { describe, expect, it } from "vitest";
import { isReservedUsername, isUsernameAllowed } from "@/lib/usernames";
import { usernameSchema } from "@/lib/schemas/auth";

describe("isReservedUsername()", () => {
  it.each([
    "admin",
    "Admin",
    "ADMINISTRATOR",
    "support",
    "System",
    "faculty",
    "teacher",
    "campusflow",
    "Campus.Flow",
    "campus_flow_ai",
    // Dots and underscores do not make a reserved name different.
    "ad.min",
    "a_d_m_i_n",
    "support_",
    ".root.",
  ])("treats %s as reserved", (value) => {
    expect(isReservedUsername(value)).toBe(true);
  });

  it.each(["administrate", "adminton", "priya.nair", "support2", "my.teacher", "rootbeer", "abc"])(
    "does not treat %s as reserved",
    (value) => {
      expect(isReservedUsername(value)).toBe(false);
    },
  );
});

describe("isUsernameAllowed()", () => {
  it("accepts ordinary usernames at the length limits", () => {
    expect(isUsernameAllowed("abc")).toBe(true);
    expect(isUsernameAllowed("a".repeat(20))).toBe(true);
    expect(isUsernameAllowed("Priya.Nair_9")).toBe(true);
  });

  it.each(["ab", "a".repeat(21), "has space", "has-dash", "emoji😀", "", "admin", "Support"])(
    "refuses %j",
    (value) => {
      expect(isUsernameAllowed(value)).toBe(false);
    },
  );
});

describe("usernameSchema (the welcome form)", () => {
  it("shows the reserved-name message in the form", () => {
    const result = usernameSchema.safeParse("Admin");
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toBe("That username can't be used.");
  });

  it("still accepts a normal username", () => {
    expect(usernameSchema.safeParse("priya.nair").success).toBe(true);
  });
});
