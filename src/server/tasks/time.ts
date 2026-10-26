import "server-only";
import { sql } from "drizzle-orm";
import { DEFAULT_DEADLINE_TIME } from "@/config/limits";
import { isValidLocalDate, isValidLocalTime, isValidTimeZone } from "@/lib/time";
import type { db } from "@/server/db/client";

// Something that can run SQL: the database, or a transaction inside a command.
type SqlRunner = Pick<typeof db, "execute">;

/**
 * Turns a local date (and optional local time) in a time zone into the UTC instant, using PostgreSQL's
 * `AT TIME ZONE`, which knows daylight saving. No date library and no hand-written offset arithmetic.
 *
 * - No time given: 23:59 on that day (DEFAULT_DEADLINE_TIME).
 * - A local time that does not exist (the clock jumps forward) or that happens twice (the clock goes back)
 *   is resolved by PostgreSQL's own rules; tests/integration/local-to-utc.test.ts records what they are.
 *
 * Callers validate the form with Zod first; a bad value here is a programming error and throws.
 */
export async function localToUtc(
  runner: SqlRunner,
  date: string,
  time: string | null,
  timeZone: string,
): Promise<Date> {
  const localTime = time ?? DEFAULT_DEADLINE_TIME;
  if (!isValidLocalDate(date)) throw new Error(`Not a valid local date: ${date}`);
  if (!isValidLocalTime(localTime)) throw new Error(`Not a valid local time: ${localTime}`);
  if (!isValidTimeZone(timeZone)) throw new Error(`Not a valid time zone: ${timeZone}`);

  const result = await runner.execute(
    sql`select floor(extract(epoch from ((${date}::date + ${localTime}::time) at time zone ${timeZone})) * 1000) as epoch_ms`,
  );
  const row = result.rows[0] as { epoch_ms: string | number | bigint } | undefined;
  if (!row) throw new Error("PostgreSQL returned no time");
  return new Date(Number(row.epoch_ms));
}
