import "server-only";
import { toLocalDateTime } from "@/lib/time";
import type { db } from "@/server/db/client";
import { localToUtc } from "@/server/tasks/time";

// Dates on suggested steps are assigned by CODE, never by the model (CLAUDE.md "AI rules", rule AI-d):
//   - only when the task has a deadline in the future; otherwise no step gets a date;
//   - the steps are spread between now and the deadline in proportion to their minutes;
//   - each step is due at 23:59 local time on the day it lands on, never after the task's deadline;
//   - the last step is due at the task's deadline itself.
// The student can change or clear every date before saving.

type SqlRunner = Pick<typeof db, "execute">;

const END_OF_DAY = "23:59";

/** The calendar day after a YYYY-MM-DD date (pure calendar arithmetic, no time zone involved). */
function nextDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * One due date per step, in the same order, or all null when the task has no deadline in the future.
 * `minutes` are the steps' estimates. Dates never go backwards from one step to the next.
 */
export async function spreadStepDates(args: {
  runner: SqlRunner;
  minutes: number[];
  now: Date;
  deadline: Date | null;
  timeZone: string;
}): Promise<Array<Date | null>> {
  const { runner, minutes, now, deadline, timeZone } = args;
  if (!deadline || deadline.getTime() <= now.getTime()) return minutes.map(() => null);

  const total = minutes.reduce((sum, value) => sum + value, 0);
  const span = deadline.getTime() - now.getTime();

  const dates: Array<Date | null> = [];
  let cumulative = 0;
  for (const [index, value] of minutes.entries()) {
    cumulative += value;
    if (index === minutes.length - 1) {
      dates.push(new Date(deadline));
      continue;
    }

    // Where this step ends on the way from now to the deadline, then the end of that local day.
    const landsAt = new Date(now.getTime() + Math.round((cumulative / total) * span));
    let day = toLocalDateTime(landsAt, timeZone).date;
    let due = await localToUtc(runner, day, END_OF_DAY, timeZone);
    if (due.getTime() <= now.getTime()) {
      // It is already past 23:59 today: use the next day, so a step is never due before it was made.
      day = nextDay(day);
      due = await localToUtc(runner, day, END_OF_DAY, timeZone);
    }
    dates.push(due.getTime() > deadline.getTime() ? new Date(deadline) : due);
  }
  return dates;
}
