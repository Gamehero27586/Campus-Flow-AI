import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localToUtc } from "@/server/tasks/time";
import { createTestDb, type TestDb } from "../helpers/test-db";

// localToUtc turns a form's local date and time into a UTC instant with PostgreSQL's AT TIME ZONE
// (docs/slices/slice-3-plan.md 3b). Run against PGlite, which is real PostgreSQL with the full time zone database.

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  close = () => test.client.close();
});

afterAll(async () => {
  await close();
});

const toUtc = async (date: string, time: string | null, zone: string) =>
  (await localToUtc(db as never, date, time, zone)).toISOString();

describe("localToUtc: India (no daylight saving)", () => {
  it("a date without a time is due at 23:59 on that day, local", async () => {
    // 23:59 IST (UTC+5:30) is 18:29 UTC the same day.
    expect(await toUtc("2026-11-02", null, "Asia/Kolkata")).toBe("2026-11-02T18:29:00.000Z");
  });

  it("uses the time when one is given", async () => {
    expect(await toUtc("2026-11-02", "17:30", "Asia/Kolkata")).toBe("2026-11-02T12:00:00.000Z");
  });

  it("midnight local is the evening before in UTC", async () => {
    expect(await toUtc("2026-11-02", "00:00", "Asia/Kolkata")).toBe("2026-11-01T18:30:00.000Z");
  });

  it("the last minute of the day stays on the same local date", async () => {
    expect(await toUtc("2026-12-31", "23:59", "Asia/Kolkata")).toBe("2026-12-31T18:29:00.000Z");
  });

  it("a deadline on 29 February of a leap year works", async () => {
    expect(await toUtc("2028-02-29", null, "Asia/Kolkata")).toBe("2028-02-29T18:29:00.000Z");
  });
});

describe("localToUtc: daylight saving", () => {
  it("London: the day before the clocks go forward (GMT, UTC+0)", async () => {
    expect(await toUtc("2026-03-28", null, "Europe/London")).toBe("2026-03-28T23:59:00.000Z");
  });

  it("London: the day the clocks go forward (BST, UTC+1) the end of day is an hour earlier in UTC", async () => {
    expect(await toUtc("2026-03-29", null, "Europe/London")).toBe("2026-03-29T22:59:00.000Z");
  });

  it("London: noon before and after the change", async () => {
    expect(await toUtc("2026-03-28", "12:00", "Europe/London")).toBe("2026-03-28T12:00:00.000Z");
    expect(await toUtc("2026-03-30", "12:00", "Europe/London")).toBe("2026-03-30T11:00:00.000Z");
  });

  it("New York: noon on the day the clocks go back is EST (UTC-5)", async () => {
    expect(await toUtc("2026-11-01", "12:00", "America/New_York")).toBe("2026-11-01T17:00:00.000Z");
  });

  it("a local time that does not exist (London, 01:30 on 29 March 2026) still gives an instant", async () => {
    // The clock goes from 01:00 straight to 02:00. PostgreSQL reads 01:30 with the offset from before the jump.
    expect(await toUtc("2026-03-29", "01:30", "Europe/London")).toBe("2026-03-29T01:30:00.000Z");
  });

  it("a local time that happens twice (London, 01:30 on 25 October 2026) gives one instant", async () => {
    // PostgreSQL reads the repeated hour as the later one (GMT, after the change).
    expect(await toUtc("2026-10-25", "01:30", "Europe/London")).toBe("2026-10-25T01:30:00.000Z");
  });
});

describe("localToUtc: accepted time zone names", () => {
  it("Asia/Kolkata and its alias Asia/Calcutta agree; UTC and Etc/GMT+5 work", async () => {
    expect(await toUtc("2026-11-02", "12:00", "Asia/Kolkata")).toBe("2026-11-02T06:30:00.000Z");
    expect(await toUtc("2026-11-02", "12:00", "Asia/Calcutta")).toBe("2026-11-02T06:30:00.000Z");
    expect(await toUtc("2026-11-02", "12:00", "UTC")).toBe("2026-11-02T12:00:00.000Z");
    expect(await toUtc("2026-11-02", "12:00", "Etc/GMT+5")).toBe("2026-11-02T17:00:00.000Z");
  });
});

describe("localToUtc: bad input is refused before it reaches the database", () => {
  it.each([
    ["2026-02-30", "10:00", "Asia/Kolkata", /valid local date/],
    ["2026-13-01", null, "Asia/Kolkata", /valid local date/],
    ["02/11/2026", null, "Asia/Kolkata", /valid local date/],
    ["2026-11-02", "24:00", "Asia/Kolkata", /valid local time/],
    ["2026-11-02", "9:00", "Asia/Kolkata", /valid local time/],
    ["2026-11-02", "10:00", "Mars/Olympus", /valid time zone/],
    // Bare offsets: Node's Intl reads "+05:30" east of UTC, PostgreSQL reads it west, so they are refused.
    ["2026-11-02", "12:00", "+05:30", /valid time zone/],
    ["2026-11-02", "12:00", "-03:00", /valid time zone/],
    ["2026-11-02", "12:00", "+0530", /valid time zone/],
  ])("%s %s %s", async (date, time, zone, message) => {
    await expect(localToUtc(db as never, date, time, zone)).rejects.toThrow(message);
  });

  it("does not let a time zone name change the SQL", async () => {
    await expect(
      localToUtc(db as never, "2026-11-02", null, "UTC'; drop table users; --"),
    ).rejects.toThrow(/valid time zone/);
  });
});
