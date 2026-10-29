import { now, toLocalDateTime } from "@/lib/time";

// Small helpers the task pages share. No database, no server-only: plain functions.

/** The dates the "When did you start?" field allows: from the day the task was created to today, local. */
export function startWindow(createdAt: Date, timeZone: string) {
  return {
    minDate: toLocalDateTime(createdAt, timeZone).date,
    maxDate: toLocalDateTime(now(), timeZone).date,
  };
}

/** A deadline as the local date a form field wants, or null. */
export function localDateOf(deadline: Date | null, timeZone: string): string | null {
  return deadline ? toLocalDateTime(deadline, timeZone).date : null;
}
