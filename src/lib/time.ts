// All "current time" in the app comes from now(), so tests can fix the clock.
// Timestamps are stored in UTC; display conversion to the user's time zone is added with the first screen that shows a time.

let fixedNow: Date | null = null;

export function now(): Date {
  return fixedNow ? new Date(fixedNow) : new Date();
}

/** Tests only: freeze now() at a given instant. */
export function setNowForTests(date: Date): void {
  fixedNow = new Date(date);
}

/** Tests only: go back to the real clock. */
export function resetNowForTests(): void {
  fixedNow = null;
}

// ---- Local dates and times (docs/slices/slice-3-plan.md 3b) ----------------------------------------------
// Forms send a local date ("2026-11-02") and an optional local time ("17:30") in the user's time zone
// (users.timezone). Turning them into a UTC instant is done by PostgreSQL in src/server/tasks/time.ts;
// everything here is pure, so browser code can use it too.

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True for a real calendar date written as YYYY-MM-DD ("2026-02-30" is not). */
export function isValidLocalDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/** True for a 24-hour time written as HH:MM. */
export function isValidLocalTime(value: string): boolean {
  return LOCAL_TIME.test(value);
}

/**
 * True when the runtime knows this IANA time zone name (aliases such as Asia/Calcutta count, and so does UTC).
 *
 * Bare offsets such as "+05:30" are refused on purpose: Node's Intl reads them as east of UTC but PostgreSQL's
 * AT TIME ZONE reads the same text as west of UTC (POSIX), so a deadline would be 11 hours out. Real names
 * such as "Etc/GMT+5" are fine, because both systems agree on those.
 */
export function isValidTimeZone(value: string): boolean {
  if (value.startsWith("+") || value.startsWith("-") || !/[A-Za-z]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

type LocalParts = { year: string; month: string; day: string; hour: string; minute: string; weekday: string; monthName: string };

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const monthName = new Intl.DateTimeFormat("en-GB", { timeZone, month: "short" }).format(instant);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    weekday: pick("weekday"),
    monthName,
  };
}

/** An instant as the local date and time in a time zone, in the shape a form field wants. */
export function toLocalDateTime(instant: Date, timeZone: string): { date: string; time: string } {
  const p = localParts(instant, timeZone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/**
 * "Mon 2 Nov, 23:59" in the user's time zone; the year is added when it is not the current year there.
 * Always shows the time, because a date-only deadline is stored as 23:59 and the user should see that.
 */
export function formatDeadline(deadline: Date, timeZone: string, current: Date = now()): string {
  const p = localParts(deadline, timeZone);
  const currentYear = localParts(current, timeZone).year;
  const year = p.year === currentYear ? "" : ` ${p.year}`;
  return `${p.weekday} ${Number(p.day)} ${p.monthName}${year}, ${p.hour}:${p.minute}`;
}

/** Overdue is calculated, never stored: a deadline in the past on a task that is not done. */
export function isOverdue(deadline: Date | null, status: "todo" | "in_progress" | "done", current: Date = now()): boolean {
  return deadline !== null && status !== "done" && deadline.getTime() < current.getTime();
}
