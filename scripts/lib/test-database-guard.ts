// A safety catch for the destructive dev scripts (db:reset).
// They may only run against the TEST database. Two separate databases exist (docs/decisions.md §18):
// DATABASE_URL is the test one while developing, DATABASE_URL_LIVE is kept, unused, for the live project.

type Env = Record<string, string | undefined>;

export type GuardResult = { ok: true } | { ok: false; reason: string };

/** The Neon project a connection string points at, so a pooled and a direct string of one project compare equal. */
export function databaseIdentity(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    // ep-small-field-b40ye06k-pooler.c-6.us-east-2.aws.neon.tech -> ep-small-field-b40ye06k
    return host.split(".")[0].replace(/-pooler$/, "");
  } catch {
    return null;
  }
}

export function checkTestDatabase(env: Env): GuardResult {
  if (env.NODE_ENV === "production") {
    return { ok: false, reason: "NODE_ENV is production." };
  }
  if (env.DEV_DB_RESET_ALLOWED !== "yes") {
    return {
      ok: false,
      reason:
        "DEV_DB_RESET_ALLOWED=yes is not set in .env.local (set it only for the test database).",
    };
  }
  const current = [env.DATABASE_URL, env.DATABASE_URL_UNPOOLED].filter(Boolean) as string[];
  if (current.length === 0) return { ok: false, reason: "DATABASE_URL is not set." };

  const live = env.DATABASE_URL_LIVE;
  if (live) {
    const liveIdentity = databaseIdentity(live);
    const sameString = current.includes(live);
    const sameProject =
      liveIdentity !== null && current.some((url) => databaseIdentity(url) === liveIdentity);
    if (sameString || sameProject) {
      return {
        ok: false,
        reason:
          "DATABASE_URL points at the same database as DATABASE_URL_LIVE. This is the LIVE database.",
      };
    }
  }
  return { ok: true };
}

/** Stops the script (exit code 1) unless it is safe to change the database. */
export function assertTestDatabase(what: string): void {
  const result = checkTestDatabase(process.env);
  if (!result.ok) {
    console.error(`Refusing to ${what}: ${result.reason}`);
    process.exit(1);
  }
}
