import { describe, expect, it } from "vitest";
import {
  formatDeadline,
  isOverdue,
  isValidLocalDate,
  isValidLocalTime,
  isValidTimeZone,
  toLocalDateTime,
} from "@/lib/time";

// Display of deadlines in the user's time zone, and the checks the forms share (docs/slices/slice-3-plan.md 3b).

const DEADLINE = new Date("2026-11-02T18:29:00Z"); // 23:59 in India, 10:29 in Los Angeles
const NOW = new Date("2026-10-26T10:00:00Z");

describe("formatDeadline", () => {
  it("shows the local day and time in India", () => {
    expect(formatDeadline(DEADLINE, "Asia/Kolkata", NOW)).toBe("Mon 2 Nov, 23:59");
  });

  it("shows the same instant in another time zone", () => {
    expect(formatDeadline(DEADLINE, "America/Los_Angeles", NOW)).toBe("Mon 2 Nov, 10:29");
  });

  it("the local date can differ from the UTC date", () => {
    // 20:00 UTC on 2 Nov is already 3 Nov, 01:30 in India.
    expect(formatDeadline(new Date("2026-11-02T20:00:00Z"), "Asia/Kolkata", NOW)).toBe("Tue 3 Nov, 01:30");
  });

  it("midnight is 00:00, not 24:00", () => {
    expect(formatDeadline(new Date("2026-11-01T18:30:00Z"), "Asia/Kolkata", NOW)).toBe("Mon 2 Nov, 00:00");
  });

  it("adds the year only when it is not the current year there", () => {
    expect(formatDeadline(new Date("2027-01-15T18:29:00Z"), "Asia/Kolkata", NOW)).toBe("Fri 15 Jan 2027, 23:59");
    // New Year: 31 Dec 2026, 20:00 UTC is already 2027 in India but still 2026 in London.
    const newYear = new Date("2026-12-31T20:00:00Z");
    expect(formatDeadline(newYear, "Asia/Kolkata", new Date("2026-12-31T20:00:00Z"))).toBe("Fri 1 Jan, 01:30");
    expect(formatDeadline(newYear, "Europe/London", new Date("2026-12-31T20:00:00Z"))).toBe("Thu 31 Dec, 20:00");
  });
});

describe("toLocalDateTime", () => {
  it("gives the date and time a form field wants", () => {
    expect(toLocalDateTime(DEADLINE, "Asia/Kolkata")).toEqual({ date: "2026-11-02", time: "23:59" });
    expect(toLocalDateTime(DEADLINE, "America/Los_Angeles")).toEqual({ date: "2026-11-02", time: "10:29" });
  });
});

describe("isOverdue", () => {
  const past = new Date("2026-10-25T00:00:00Z");
  const future = new Date("2026-10-27T00:00:00Z");

  it("is overdue when the deadline has passed and the task is not done", () => {
    expect(isOverdue(past, "todo", NOW)).toBe(true);
    expect(isOverdue(past, "in_progress", NOW)).toBe(true);
  });

  it("is never overdue when done, with no deadline, or with a deadline in the future", () => {
    expect(isOverdue(past, "done", NOW)).toBe(false);
    expect(isOverdue(null, "todo", NOW)).toBe(false);
    expect(isOverdue(future, "todo", NOW)).toBe(false);
  });

  it("is not overdue at the exact deadline instant", () => {
    expect(isOverdue(NOW, "todo", NOW)).toBe(false);
  });
});

describe("form checks", () => {
  it("isValidLocalDate", () => {
    expect(isValidLocalDate("2026-11-02")).toBe(true);
    expect(isValidLocalDate("2028-02-29")).toBe(true);
    expect(isValidLocalDate("2026-02-29")).toBe(false);
    expect(isValidLocalDate("2026-04-31")).toBe(false);
    expect(isValidLocalDate("2026-1-2")).toBe(false);
    expect(isValidLocalDate("")).toBe(false);
  });

  it("isValidLocalTime", () => {
    expect(isValidLocalTime("00:00")).toBe(true);
    expect(isValidLocalTime("23:59")).toBe(true);
    expect(isValidLocalTime("24:00")).toBe(false);
    expect(isValidLocalTime("12:60")).toBe(false);
    expect(isValidLocalTime("9:30")).toBe(false);
  });

  it("isValidTimeZone", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  // Bare offsets mean opposite things in Node and PostgreSQL: for "+05:30", Node's Intl reads 5.5 hours EAST of
  // UTC but PostgreSQL's AT TIME ZONE reads 5.5 hours WEST (12:00 local on 2 Nov would be 17:30 UTC instead of
  // 06:30 UTC). Only IANA names are accepted; Etc/GMT+5 is fine because both systems agree on it.
  it("refuses bare offsets and accepts real names", () => {
    for (const bad of ["+05:30", "-03:00", "+0530", "0530", "5"]) expect(isValidTimeZone(bad)).toBe(false);
    for (const good of ["Asia/Kolkata", "Asia/Calcutta", "UTC", "Etc/GMT+5"]) {
      expect(isValidTimeZone(good)).toBe(true);
    }
  });
});
