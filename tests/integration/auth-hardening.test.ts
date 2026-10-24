import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Auth, createAuth } from "@/server/auth/create-auth";
import { roles, session, users } from "@/server/db/schema";
import { createTestDb, type TestDb } from "../helpers/test-db";

const BASE_URL = "http://localhost:3000";

let db: TestDb;
let auth: Auth;
let close: () => Promise<void>;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  close = () => test.client.close();
  auth = createAuth(db, { secret: "test-secret-test-secret-test-secret-0000", baseURL: BASE_URL });
});

afterAll(async () => {
  await close();
});

async function call(path: string, body: unknown, cookie?: string, method: "POST" | "GET" = "POST") {
  const headers = new Headers({ "content-type": "application/json", origin: BASE_URL });
  if (cookie) headers.set("cookie", cookie);
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method,
      headers,
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

function toCookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

/**
 * Creates a user through the real sign-up endpoint, then signs in (sign-up does not sign anyone in).
 * Returns the stored row and the session cookie from the sign-in.
 */
async function signUp(extra: Record<string, unknown> = {}) {
  const email = `${randomUUID()}@example.com`;
  const response = await call("/sign-up/email", {
    name: "Test User",
    email,
    password: "correct-horse-battery",
    ...extra,
  });
  const [row] = await db.select().from(users).where(eq(users.email, email));
  let cookie = "";
  if (row) {
    const signIn = await call("/sign-in/email", { email, password: "correct-horse-battery" });
    cookie = toCookieHeader(signIn);
  }
  return { email, response, row, cookie };
}

describe("sign-up", () => {
  it.each([
    ["status", { status: "active" }],
    ["roleId", { roleId: randomUUID() }],
    ["requestedRole", { requestedRole: "faculty" }],
    ["timezone", { timezone: "UTC" }],
    ["approvedBy", { approvedBy: randomUUID() }],
    ["rejectionReason", { rejectionReason: "none" }],
    ["isSeed", { isSeed: true }],
  ])("a sign-up that sets %s never changes the stored defaults", async (_field, extra) => {
    // Better Auth either refuses the request or drops the field. Both are safe, and each branch
    // below asserts something: refused means an error status and no account; accepted means the
    // account has only the safe defaults.
    const { row, response } = await signUp(extra);
    if (!row) {
      expect(response.status).toBeGreaterThanOrEqual(400);
      return;
    }
    expect(response.status).toBe(200);
    expect(row.status).toBe("pending");
    expect(row.roleId).toBeNull();
    expect(row.requestedRole).toBeNull();
    expect(row.timezone).toBe("Asia/Kolkata");
    expect(row.approvedBy).toBeNull();
    expect(row.rejectionReason).toBeNull();
    expect(row.isSeed).toBe(false);
  });

  it("refuses a name longer than 100 characters, and accepts exactly 100", async () => {
    const tooLong = await signUp({ name: "a".repeat(101) });
    expect(tooLong.response.status).toBeGreaterThanOrEqual(400);
    expect(tooLong.row).toBeUndefined();

    const exact = await signUp({ name: "a".repeat(100) });
    expect(exact.response.status).toBe(200);
    expect(exact.row.name).toHaveLength(100);
  });

  it("refuses a blank name", async () => {
    const blank = await signUp({ name: "   " });
    expect(blank.response.status).toBeGreaterThanOrEqual(400);
    expect(blank.row).toBeUndefined();
  });

  it("trims the name it stores", async () => {
    const { row } = await signUp({ name: "  Priya Nair  " });
    expect(row.name).toBe("Priya Nair");
  });

  it("stores no image, whatever the sign-up request sends", async () => {
    const { row, response } = await signUp({ image: "https://tracker.example.com/pixel.png" });
    // Either refused, or accepted with the image dropped. Never stored.
    if (row) {
      expect(response.status).toBe(200);
      expect(row.image).toBeNull();
    } else {
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("drops an image at the create hook even if a request got that far", async () => {
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser(
      {
        name: "Backstop",
        email: `${randomUUID()}@example.com`,
        emailVerified: false,
        image: "https://tracker.example.com/pixel.png",
      } as never,
      { method: "email" } as never,
    );
    const [row] = await db.select().from(users).where(eq(users.id, created.id));
    expect(row.image).toBeNull();
  });

  it("creates a pending account with no role even if the create hook is reached with other values", async () => {
    // The create hook is the backstop behind input: false. Call the adapter directly to reach it.
    const [role] = await db
      .insert(roles)
      .values({ key: `admin-${randomUUID()}`, name: "Admin" })
      .returning();
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser(
      {
        name: "Backstop",
        email: `${randomUUID()}@example.com`,
        emailVerified: false,
        status: "active",
        roleId: role.id,
        requestedRole: "faculty",
        isSeed: true,
      } as never,
      { method: "email" } as never,
    );
    const [row] = await db.select().from(users).where(eq(users.id, created.id));
    expect(row.status).toBe("pending");
    expect(row.roleId).toBeNull();
    expect(row.requestedRole).toBeNull();
    expect(row.isSeed).toBe(false);
  });

  it("creates a pending account with the default time zone", async () => {
    const { row } = await signUp();
    expect(row.status).toBe("pending");
    expect(row.roleId).toBeNull();
    expect(row.timezone).toBe("Asia/Kolkata");
  });

  it("stores the user id as a uuid and marks the email as not verified", async () => {
    const { row } = await signUp();
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(row.emailVerified).toBe(false);
  });

  it("creates the account without signing anyone in", async () => {
    const email = `${randomUUID()}@example.com`;
    const response = await call("/sign-up/email", {
      name: "Fresh Person",
      email,
      password: "correct-horse-battery",
    });
    const [row] = await db.select().from(users).where(eq(users.email, email));
    const sessions = await db.select().from(session).where(eq(session.userId, row.id));

    expect(response.status).toBe(200);
    // No session cookie comes back and no session row exists until the person signs in.
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(sessions).toHaveLength(0);

    await call("/sign-in/email", { email, password: "correct-horse-battery" });
    expect(await db.select().from(session).where(eq(session.userId, row.id))).toHaveLength(1);
  });

  it("signs in with the right password and refuses the wrong one", async () => {
    const { email } = await signUp();
    const good = await call("/sign-in/email", { email, password: "correct-horse-battery" });
    const bad = await call("/sign-in/email", { email, password: "wrong-password-here" });
    expect(good.status).toBe(200);
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });
});

describe("update-user cannot change app-owned fields (permissions.md §9)", () => {
  const attacks: Array<[string, Record<string, unknown>]> = [
    ["status", { status: "active" }],
    ["roleId", { roleId: randomUUID() }],
    ["requestedRole", { requestedRole: "faculty" }],
    ["timezone", { timezone: "UTC" }],
    ["approvedBy", { approvedBy: randomUUID() }],
    ["approvedAt", { approvedAt: new Date().toISOString() }],
    ["rejectionReason", { rejectionReason: "none" }],
    ["isSeed", { isSeed: true }],
  ];

  it.each(attacks)("refuses %s and leaves the row unchanged", async (_field, payload) => {
    const { row: before, cookie } = await signUp();
    const response = await call("/update-user", payload, cookie);
    const [after] = await db.select().from(users).where(eq(users.id, before.id));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(after.status).toBe(before.status);
    expect(after.roleId).toBe(before.roleId);
    expect(after.requestedRole).toBe(before.requestedRole);
    expect(after.timezone).toBe(before.timezone);
    expect(after.approvedBy).toBe(before.approvedBy);
    expect(after.approvedAt).toBe(before.approvedAt);
    expect(after.rejectionReason).toBe(before.rejectionReason);
    expect(after.isSeed).toBe(before.isSeed);
  });

  it("refuses to set an image and leaves the row unchanged", async () => {
    const { row: before, cookie } = await signUp();
    const response = await call(
      "/update-user",
      { image: "https://tracker.example.com/pixel.png" },
      cookie,
    );
    const [after] = await db.select().from(users).where(eq(users.id, before.id));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(after.image).toBeNull();
  });

  it.each([
    ["longer than 100 characters", "b".repeat(101)],
    ["blank", "   "],
    ["empty", ""],
  ])("refuses a name that is %s and leaves the row unchanged", async (_label, name) => {
    const { row: before, cookie } = await signUp({ name: "Original Name" });
    const response = await call("/update-user", { name }, cookie);
    const [after] = await db.select().from(users).where(eq(users.id, before.id));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(after.name).toBe("Original Name");
  });

  it("accepts a name of exactly 100 characters and trims it", async () => {
    const { row, cookie } = await signUp();
    const response = await call("/update-user", { name: `  ${"c".repeat(100)}  ` }, cookie);
    const [after] = await db.select().from(users).where(eq(users.id, row.id));
    expect(response.status).toBe(200);
    expect(after.name).toBe("c".repeat(100));
  });

  it("still lets a user change an ordinary field such as their name", async () => {
    const { row, cookie } = await signUp();
    const response = await call("/update-user", { name: "New Name" }, cookie);
    const [after] = await db.select().from(users).where(eq(users.id, row.id));
    expect(response.status).toBe(200);
    expect(after.name).toBe("New Name");
  });
});

describe("usernames", () => {
  // The welcome action sends both, so the typed form is kept for display.
  async function setUsername(cookie: string, username: string) {
    return call("/update-user", { username, displayUsername: username }, cookie);
  }

  it("stores the username in lower case and keeps the typed form for display", async () => {
    const { row, cookie } = await signUp();
    const response = await setUsername(cookie, "Arjun.Dev_1");
    const [after] = await db.select().from(users).where(eq(users.id, row.id));
    expect(response.status).toBe(200);
    expect(after.username).toBe("arjun.dev_1");
    expect(after.displayUsername).toBe("Arjun.Dev_1");
  });

  it("does not let the display username differ from the username except in letter case", async () => {
    const { row, cookie } = await signUp();
    await setUsername(cookie, "real.name");
    const impostor = await call("/update-user", { displayUsername: "Admin" }, cookie);
    const caseOnly = await call("/update-user", { displayUsername: "REAL.name" }, cookie);
    const [after] = await db.select().from(users).where(eq(users.id, row.id));
    expect(impostor.status).toBeGreaterThanOrEqual(400);
    expect(caseOnly.status).toBe(200);
    expect(after.displayUsername).toBe("REAL.name");
  });

  it("does not let a user without a username set a display username", async () => {
    const { row, cookie } = await signUp();
    const response = await call("/update-user", { displayUsername: "Admin" }, cookie);
    const [after] = await db.select().from(users).where(eq(users.id, row.id));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(after.displayUsername).toBeNull();
  });

  it("cannot be changed once it is set", async () => {
    const { row, cookie } = await signUp();
    await setUsername(cookie, "first.name");
    const second = await setUsername(cookie, "second.name");
    const [after] = await db.select().from(users).where(eq(users.id, row.id));
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(after.username).toBe("first.name");
  });

  it.each([
    ["too short", "ab"],
    ["too long", "a".repeat(21)],
    ["contains a space", "has space"],
    ["contains a dash", "has-dash"],
  ])("refuses a username that is %s", async (_label, username) => {
    const { row, cookie } = await signUp();
    const response = await setUsername(cookie, username);
    const [after] = await db.select().from(users).where(eq(users.id, row.id));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(after.username).toBeNull();
  });

  it("accepts exactly 3 and exactly 20 characters", async () => {
    const short = await signUp();
    const long = await signUp();
    expect((await setUsername(short.cookie, "abc")).status).toBe(200);
    expect((await setUsername(long.cookie, "a".repeat(20))).status).toBe(200);
  });

  it("refuses a username that someone else already has", async () => {
    const one = await signUp();
    const two = await signUp();
    await setUsername(one.cookie, "taken.name");
    const response = await setUsername(two.cookie, "Taken.Name");
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("endpoints that must not exist", () => {
  it.each([
    "/is-username-available",
    "/sign-in/username",
    "/request-password-reset",
    "/forget-password",
    "/send-verification-email",
    "/unlink-account",
  ])("%s is disabled", async (path) => {
    const { cookie } = await signUp();
    const response = await call(path, { username: "someone", email: "a@example.com" }, cookie);
    expect(response.status).toBe(404);
  });

  it("/link-social needs a signed-in session: Connect Google is explicit linking only", async () => {
    // Enabled (it is how Settings connects Google), but it must never work for a visitor.
    const response = await call("/link-social", { provider: "google", callbackURL: "/settings" });
    expect(response.status).toBe(401);
  });

  it("/list-accounts is disabled (it is a GET, so it is called with GET)", async () => {
    const { cookie } = await signUp();
    const response = await call("/list-accounts", undefined, cookie, "GET");
    expect(response.status).toBe(404);
  });

  it("an enabled endpoint answers the same way, so the 404s above mean 'disabled'", async () => {
    // Sanity check for the tests above: with a session, /get-session (a GET) is reachable.
    const { cookie } = await signUp();
    const response = await call("/get-session", undefined, cookie, "GET");
    expect(response.status).toBe(200);
  });
});

describe("security settings", () => {
  it("keeps the session cookie cache off", () => {
    expect(auth.options.session?.cookieCache?.enabled).toBe(false);
  });

  it("does not link a Google login to an existing account implicitly", () => {
    expect(auth.options.account?.accountLinking?.disableImplicitLinking).toBe(true);
  });

  it("does not require email verification (no email is sent in the MVP)", () => {
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false);
  });
});
