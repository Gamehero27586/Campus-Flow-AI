import Link from "next/link";
import { CalendarIcon, ChevronRightIcon, ListChecksIcon } from "lucide-react";
import { formatDeadline, isOverdue } from "@/lib/time";
import type { TaskListItem } from "@/server/tasks/queries";
import { DoneButton, StartButton } from "@/app/(app)/tasks/task-buttons";
import { startWindow } from "@/app/(app)/tasks/view";
import {
  categoryLabel,
  OverdueBadge,
  PriorityText,
  StatusBadge,
} from "@/app/(app)/tasks/task-badges";

/**
 * One task in the list: title, state, deadline, category, priority, steps, and the one action that fits
 * its state: Start for To Do, Mark done for In progress, nothing for Done (Reopen is on the detail page).
 */
export function TaskCard({ task, timeZone }: { task: TaskListItem; timeZone: string }) {
  const { minDate, maxDate } = startWindow(task.createdAt, timeZone);
  const overdue = isOverdue(task.deadline, task.status);
  const openSteps = task.stepsTotal - task.stepsDone;

  return (
    // The whole card opens the task (a "stretched link": the title link covers the card, the buttons sit above it),
    // so a tap anywhere on a phone works, not only on the title.
    <li className="relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <Link
          href={`/tasks/${task.id}`}
          className="flex items-center gap-1 text-base font-semibold break-words hover:underline after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {task.title}
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={task.status} />
          {overdue ? <OverdueBadge /> : null}
          <span className="text-sm text-muted-foreground">
            {categoryLabel(task.category, task.categoryOther)}
          </span>
          <span className="text-sm text-muted-foreground">
            <PriorityText priority={task.priority} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarIcon className="size-3.5" aria-hidden="true" />
            {task.deadline ? `Due ${formatDeadline(task.deadline, timeZone)}` : "No deadline"}
          </span>
          {task.stepsTotal > 0 ? (
            <span className="inline-flex items-center gap-1">
              <ListChecksIcon className="size-3.5" aria-hidden="true" />
              {task.stepsDone} of {task.stepsTotal} {task.stepsTotal === 1 ? "step" : "steps"} done
            </span>
          ) : null}
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        {task.status === "todo" ? <StartButton taskId={task.id} /> : null}
        {task.status === "in_progress" ? (
          <DoneButton
            taskId={task.id}
            openSteps={openSteps}
            minDate={minDate}
            maxDate={maxDate}
          />
        ) : null}
      </div>
    </li>
  );
}
