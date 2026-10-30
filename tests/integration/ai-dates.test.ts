import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spreadStepDates } from "@/server/ai/dates";
import { createTestDb, type TestDb } from "../helpers/test-db";

// Rule AI-d: code assigns the dates of suggested steps. The expected values below were worked out by hand
// (shown in each test), with a fixed "now". Local-to-UTC conversion is PostgreSQL's, as for every deadline.

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

// 10:00 on Monday 2 November 2026 in India (UTC+5:30).
const NOW = new Date("2026-11-02T04:30:00Z");
const iso = (dates: Array<Date | null>) => dates.map((date) => (date ? date.toISOString() : null));

const spread = (minutes: number[], deadline: Date | null, timeZone = "Asia/Kolkata", now = NOW) =>
  spreadStepDates({ runner: db as never, minutes, now, deadline, timeZone });

describe("no dates without a deadline in the future", () => {
  it("no deadline: every step has no date", async () => {
    expect(await spread([30, 60, 90], null)).toEqual([null, null, null]);
  });

  it("a deadline that has passed, or is exactly now: no dates", async () => {
    expect(await spread([30, 60, 90], new Date("2026-11-01T10:00:00Z"))).toEqual([null, null, null]);
    expect(await spread([30, 60, 90], NOW)).toEqual([null, null, null]);
  });
});

describe("spread in proportion to the minutes", () => {
  it("a week: Monday 10:00 to Friday 17:00 India, steps of 60, 60, 120 and 60 minutes", async () => {
    // Deadline Fri 6 Nov 17:00 IST = 11:30Z. Span 103 h. Minutes total 300, running totals 60, 120, 240, 300.
    //  60/300 of 103 h = 20.6 h after Mon 10:00 -> Tue 06:36 IST    -> due Tue 3 Nov 23:59 IST = 18:29Z
    // 120/300 of 103 h = 41.2 h               -> Wed 03:12 IST    -> due Wed 4 Nov 23:59 IST = 18:29Z
    // 240/300 of 103 h = 82.4 h               -> Thu 20:24 IST    -> due Thu 5 Nov 23:59 IST = 18:29Z
    // The last step is due at the deadline itself.
    const dates = await spread([60, 60, 120, 60], new Date("2026-11-06T11:30:00Z"));
    expect(iso(dates)).toEqual([
      "2026-11-03T18:29:00.000Z",
      "2026-11-04T18:29:00.000Z",
      "2026-11-05T18:29:00.000Z",
      "2026-11-06T11:30:00.000Z",
    ]);
  });

  it("uneven minutes put a long step's end later than a short one's", async () => {
    // Deadline Sun 8 Nov 17:00 IST = 11:30Z, span 175 h. Minutes [10, 590, 10] total 610.
    //  10/610 -> 2.9 h after Mon 10:00 = Mon 12:52 IST -> due Mon 2 Nov 23:59 IST = 18:29Z
    // 600/610 -> 172.1 h -> Sun 8 Nov 14:07 IST       -> due Sun 8 Nov 23:59 IST, after the deadline, so the deadline
    const dates = await spread([10, 590, 10], new Date("2026-11-08T11:30:00Z"));
    expect(iso(dates)).toEqual([
      "2026-11-02T18:29:00.000Z",
      "2026-11-08T11:30:00.000Z",
      "2026-11-08T11:30:00.000Z",
    ]);
  });

  it("one step: it is simply due at the deadline", async () => {
    const deadline = new Date("2026-11-04T08:00:00Z");
    expect(iso(await spread([45], deadline))).toEqual([deadline.toISOString()]);
  });
});

describe("never after the deadline", () => {
  it("a deadline later today: every step is due at the deadline, not at 23:59", async () => {
    // Deadline Mon 2 Nov 17:00 IST = 11:30Z. Every step lands today, whose end of day (18:29Z) is after it.
    const deadline = new Date("2026-11-02T11:30:00Z");
    expect(iso(await spread([30, 30, 60], deadline))).toEqual([
      deadline.toISOString(),
      deadline.toISOString(),
      deadline.toISOString(),
    ]);
  });

  it("just after 23:59 local time a step is not given a time that has already passed", async () => {
    // 23:59:10 IST Monday = 18:29:10Z. Deadline one hour later. The first step lands 36 seconds on, still
    // the same minute: its day's 23:59 is already behind us, so it moves to the next day and is then capped.
    const now = new Date("2026-11-02T18:29:10Z");
    const deadline = new Date("2026-11-02T19:29:10Z");
    const dates = await spread([5, 595], deadline, "Asia/Kolkata", now);
    for (const date of dates) {
      expect(date!.getTime()).toBeGreaterThan(now.getTime());
      expect(date!.getTime()).toBeLessThanOrEqual(deadline.getTime());
    }
    expect(iso(dates)).toEqual([deadline.toISOString(), deadline.toISOString()]);
  });

  it("dates never go backwards from one step to the next", async () => {
    const deadline = new Date("2026-11-20T11:30:00Z");
    const dates = (await spread([15, 45, 30, 120, 5, 300, 60], deadline)) as Date[];
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime()).toBeGreaterThanOrEqual(dates[i - 1].getTime());
    }
    expect(dates.at(-1)!.getTime()).toBe(deadline.getTime());
  });
});

describe("the user's own time zone", () => {
  it("New York across the end of daylight saving time (1 Nov 2026): two steps can share a day", async () => {
    // now Sun 1 Nov 12:00Z (07:00 EST after the clocks went back). Deadline Tue 3 Nov 22:00Z (17:00 EST). Span 58 h.
    // Three equal steps: 1/3 -> 19 h 20 m -> Mon 2 Nov 02:20 EST -> due Mon 2 Nov 23:59 EST = 04:59Z on the 3rd
    //                    2/3 -> 38 h 40 m -> Mon 2 Nov 21:40 EST -> due Mon 2 Nov 23:59 EST, the same instant
    const now = new Date("2026-11-01T12:00:00Z");
    const deadline = new Date("2026-11-03T22:00:00Z");
    const dates = await spread([60, 60, 60], deadline, "America/New_York", now);
    expect(iso(dates)).toEqual([
      "2026-11-03T04:59:00.000Z",
      "2026-11-03T04:59:00.000Z",
      "2026-11-03T22:00:00.000Z",
    ]);
  });

  it("the same instants give a different day in a time zone far from India", async () => {
    // "Now" (04:30Z) is 23:30 on Sunday 1 Nov in New York (UTC-5). The first step lands 5/600 of 103 h = 0.86 h
    // later, 05:21Z = 00:21 on MONDAY there, so it is due Monday 23:59 EST = 04:59Z on the 3rd. The same step
    // for a student in India lands on Monday 10:51 IST and is due Monday 23:59 IST = 18:29Z on the 2nd.
    const deadline = new Date("2026-11-06T11:30:00Z");
    const [inNewYork] = await spread([5, 595], deadline, "America/New_York");
    const [inIndia] = await spread([5, 595], deadline, "Asia/Kolkata");
    expect(inNewYork!.toISOString()).toBe("2026-11-03T04:59:00.000Z");
    expect(inIndia!.toISOString()).toBe("2026-11-02T18:29:00.000Z");
  });
});
