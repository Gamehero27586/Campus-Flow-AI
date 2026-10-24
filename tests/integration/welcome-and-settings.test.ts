import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { auth } from "@/server/auth/better-auth";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { account, users } from "@/server/db/schema";
import { changePassword, completeWelcome, updateTimezone } from "@/server/users/commands";
import { hasGoogleLogin, hasPasswordLogin } from "@/server/users/queries";
import { isValidTimeZone, timezoneSchema } from "@/lib/schemas/settings";
import { usernameSchema, welcomeSchema } from "@/lib/schemas/auth";
import { asCurrentUser } from "../helpers/factories";
import type { TestDb } from "../helpers/test-db";

// The real Better Auth (src/server/auth/better-auth.ts) running on an in-memory Postgres.
vi.mock("@/server/db/client", async () => {
  const { createTestDb } = await import("../helpers/test-db");
  const { db } = await createTestDb();
  return { db };
});

const testDb = db as unknown as TestDb;
const PASSWORD = "correct-horse-battery";

/**
 * Signs up through Better Auth, then signs in (sign-up does not sign anyone in), and returns the
 * stored user and request headers carrying the session.
 */
async function signUp() {
  const email = `${randomUUID()}@example.com`;
  await auth.api.signUpEmail({ body: { name: "New Person", email, password: PASSWORD } });
  const { headers: responseHeaders } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = responseHeaders
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  const [row] = await testDb.select().from(users).where(eq(users.email, email));
  return { row, user: asCurrentUser(row) as CurrentUser, headers: new Headers({ cookie }), email };
}

async function reload(id: string) {
  const [row] = await testDb.select().from(users).where(eq(users.id, id));
  return row;
}

describe("completeWelcome()", () => {
  it("sets the username (lower case, typed form kept) and the requested role", async () => {
    const { row, user, headers } = await signUp();

    const result = await completeWelcome(
      user,
      { username: "Priya.Nair_9", requestedRole: "faculty" },
      headers,
    );

    expect(result.ok).toBe(true);
    const after = await reload(row.id);
    expect(after.username).toBe("priya.nair_9");
    expect(after.displayUsername).toBe("Priya.Nair_9");
    expect(after.requestedRole).toBe("faculty");
    // Finishing the welcome screen does not approve anyone.
    expect(after.status).toBe("pending");
    expect(after.roleId).toBeNull();
  });

  it("works with no requested role", async () => {
    const { row, user, headers } = await signUp();
    const result = await completeWelcome(user, { username: "no.preference" }, headers);
    expect(result.ok).toBe(true);
    expect((await reload(row.id)).requestedRole).toBeNull();
  });

  it("cannot be done twice: the username never changes", async () => {
    const { row, user, headers } = await signUp();
    await completeWelcome(user, { username: "first.choice" }, headers);

    const second = await completeWelcome(
      { ...user, username: "first.choice" },
      { username: "second.choice" },
      headers,
    );

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("already_set");
    expect((await reload(row.id)).username).toBe("first.choice");
  });

  it("refuses a username someone else has, with the same message as any other refusal", async () => {
    const one = await signUp();
    const two = await signUp();
    await completeWelcome(one.user, { username: "taken.name" }, one.headers);

    const result = await completeWelcome(two.user, { username: "Taken.Name" }, two.headers);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("username_unavailable");
    expect((await reload(two.row.id)).username).toBeNull();
  });

  it.each(["Admin", "support", "ad.min", "SUPPORT_", "Campus.Flow", "faculty"])(
    "refuses the reserved username %s with the same generic message",
    async (reserved) => {
      const { row, user, headers } = await signUp();
      const result = await completeWelcome(user, { username: reserved }, headers);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("username_unavailable");
      expect((await reload(row.id)).username).toBeNull();
    },
  );

  it("still allows a username that only contains a reserved word", async () => {
    const { row, user, headers } = await signUp();
    const result = await completeWelcome(user, { username: "administrate" }, headers);
    expect(result.ok).toBe(true);
    expect((await reload(row.id)).username).toBe("administrate");
  });

  it("does not let a request without a valid session set anything", async () => {
    const { row, user } = await signUp();
    await expect(
      completeWelcome(user, { username: "no.session" }, new Headers()),
    ).resolves.toMatchObject({ ok: false });
    expect((await reload(row.id)).username).toBeNull();
  });
});

describe("welcome form schema", () => {
  it.each(["abc", "a".repeat(20), "A.b_c", "name.with.dots"])("accepts %s", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });

  it.each(["ab", "a".repeat(21), "has space", "has-dash", "emoji😀", "", "semi;colon"])(
    "refuses %j",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );

  it("turns an empty requested role into 'no preference' and refuses admin", () => {
    expect(
      welcomeSchema.parse({ username: "valid.name", requestedRole: "" }).requestedRole,
    ).toBeUndefined();
    expect(
      welcomeSchema.safeParse({ username: "valid.name", requestedRole: "admin" }).success,
    ).toBe(false);
  });
});

describe("settings", () => {
  it("saves a time zone for the signed-in user only", async () => {
    const mine = await signUp();
    const other = await signUp();

    await updateTimezone(mine.user, "America/New_York");

    expect((await reload(mine.row.id)).timezone).toBe("America/New_York");
    expect((await reload(other.row.id)).timezone).toBe("Asia/Kolkata");
  });

  it("recognises real time zones and rejects made-up ones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Asia/Calcutta")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(timezoneSchema.safeParse("Mars/Olympus_Mons").success).toBe(false);
    expect(timezoneSchema.safeParse("").success).toBe(false);
  });

  it("changes the password only with the right current password", async () => {
    const { email, headers, user } = await signUp();

    const wrong = await changePassword(
      { currentPassword: "not-the-password", newPassword: "a-brand-new-password" },
      headers,
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.code).toBe("password_change_failed");
    await expect(
      auth.api.signInEmail({ body: { email, password: PASSWORD } }),
    ).resolves.toBeTruthy();

    const right = await changePassword(
      { currentPassword: PASSWORD, newPassword: "a-brand-new-password" },
      headers,
    );
    expect(right.ok).toBe(true);
    await expect(
      auth.api.signInEmail({ body: { email, password: "a-brand-new-password" } }),
    ).resolves.toBeTruthy();
    await expect(auth.api.signInEmail({ body: { email, password: PASSWORD } })).rejects.toThrow();
    expect(await hasPasswordLogin(user)).toBe(true);
  });

  it("knows whether Google is connected", async () => {
    const { user, row } = await signUp();
    expect(await hasGoogleLogin(user)).toBe(false);

    // What a successful Connect Google leaves behind: an account row for the provider.
    await testDb.insert(account).values({
      accountId: `google-${randomUUID()}`,
      providerId: "google",
      userId: row.id,
    });

    expect(await hasGoogleLogin(user)).toBe(true);
    // Connecting Google does not remove the password login.
    expect(await hasPasswordLogin(user)).toBe(true);
  });

  it("knows an account without a password login", async () => {
    const { user, row } = await signUp();
    expect(await hasPasswordLogin(user)).toBe(true);
    // A Google-only account has no credential row. Simulate by looking up a user who never signed up with a password.
    expect(await hasPasswordLogin({ ...user, id: randomUUID() })).toBe(false);
    expect(row.id).toBe(user.id);
  });
});
