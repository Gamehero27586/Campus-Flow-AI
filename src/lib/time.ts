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
