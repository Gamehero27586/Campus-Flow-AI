import { describe, expect, it } from "vitest";
import { checkTestDatabase, databaseIdentity } from "../../scripts/lib/test-database-guard";

// The destructive dev scripts must never run against the live database.

const TEST_POOLED =
  "postgresql://u:p@ep-test-aaa111-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";
const TEST_DIRECT =
  "postgresql://u:p@ep-test-aaa111.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";
const LIVE_POOLED =
  "postgresql://u:p@ep-live-bbb222-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require";
const LIVE_DIRECT =
  "postgresql://u:p@ep-live-bbb222.ap-south-1.aws.neon.tech/neondb?sslmode=require";

const allowed = { DEV_DB_RESET_ALLOWED: "yes", DATABASE_URL: TEST_POOLED };

describe("databaseIdentity()", () => {
  it("is the same for the pooled and the direct string of one Neon project", () => {
    expect(databaseIdentity(TEST_POOLED)).toBe("ep-test-aaa111");
    expect(databaseIdentity(TEST_DIRECT)).toBe("ep-test-aaa111");
  });

  it("differs between projects", () => {
    expect(databaseIdentity(TEST_POOLED)).not.toBe(databaseIdentity(LIVE_POOLED));
  });

  it("is null for nothing or nonsense", () => {
    expect(databaseIdentity(undefined)).toBeNull();
    expect(databaseIdentity("not a url")).toBeNull();
  });
});

describe("checkTestDatabase()", () => {
  it("allows the test database when the switch is on", () => {
    expect(checkTestDatabase(allowed)).toEqual({ ok: true });
  });

  it("allows it while a different live database is saved", () => {
    expect(checkTestDatabase({ ...allowed, DATABASE_URL_LIVE: LIVE_POOLED })).toEqual({ ok: true });
  });

  it("refuses without DEV_DB_RESET_ALLOWED=yes", () => {
    const result = checkTestDatabase({ DATABASE_URL: TEST_POOLED });
    expect(result.ok).toBe(false);
    expect(checkTestDatabase({ ...allowed, DEV_DB_RESET_ALLOWED: "true" }).ok).toBe(false);
    expect(checkTestDatabase({ ...allowed, DEV_DB_RESET_ALLOWED: "" }).ok).toBe(false);
  });

  it("refuses when DATABASE_URL is the live database (same string)", () => {
    const result = checkTestDatabase({
      DEV_DB_RESET_ALLOWED: "yes",
      DATABASE_URL: LIVE_POOLED,
      DATABASE_URL_LIVE: LIVE_POOLED,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/LIVE/);
  });

  it("refuses when the live database is reached by its other (pooled or direct) address", () => {
    expect(
      checkTestDatabase({
        DEV_DB_RESET_ALLOWED: "yes",
        DATABASE_URL: LIVE_POOLED,
        DATABASE_URL_LIVE: LIVE_DIRECT,
      }).ok,
    ).toBe(false);
  });

  it("refuses when only the direct string points at the live database", () => {
    expect(
      checkTestDatabase({
        ...allowed,
        DATABASE_URL_UNPOOLED: LIVE_DIRECT,
        DATABASE_URL_LIVE: LIVE_POOLED,
      }).ok,
    ).toBe(false);
  });

  it("refuses in production and without a database", () => {
    expect(checkTestDatabase({ ...allowed, NODE_ENV: "production" }).ok).toBe(false);
    expect(checkTestDatabase({ DEV_DB_RESET_ALLOWED: "yes" }).ok).toBe(false);
  });
});
