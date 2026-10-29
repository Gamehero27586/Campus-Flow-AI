import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarIcon, ChevronRightIcon, ClockIcon } from "lucide-react";
import { formatDeadline, isOverdue, toLocalDateTime } from "@/lib/time";
import { taskIdSchema } from "@/lib/schemas/tasks";
import { requirePermission } from "@/server/policies/authorize";
import { getMyTask, type StepDetail } from "@/server/tasks/queries";
import { BackLink } from "@/app/(app)/tasks/back-link";
import { StartPromptHost } from "@/app/(app)/tasks/start-prompt";
import {
  categoryLabel,
  OverdueBadge,
  PriorityText,
  StatusBadge,
} from "@/app/(app)/tasks/task-badges";
import {
  DeleteButton,
  DoneButton,
  MoveBackButton,
  ReopenButton,
  RestoreButton,
  StartButton,
} from "@/app/(app)/tasks/task-buttons";
import {
  AddStepForm,
  ChangeDeadlineDialog,
  EditStepDialog,
  EditTaskDialog,
} from "@/app/(app)/tasks/task-forms";
import { localDateOf, startWindow } from "@/app/(app)/tasks/view";

export default async function TaskPage({ params }: PageProps<"/tasks/[taskId]">) {
  const { user } = await requirePermission("task.personal.manage");

  // Not a task id, not yours, or not a personal task: all the same answer, "not found".
  const parsedId = taskIdSchema.safeParse((await params).taskId);
  if (!parsedId.success) notFound();
  const task = await getMyTask(user, parsedId.data);
  if (!task) notFound();

  const timeZone = user.timezone;
  const isStep = task.parent !== null;
  const deleted = task.deletedAt !== null;
  const overdue = !deleted && isOverdue(task.deadline, task.status);
  const { minDate, maxDate } = startWindow(task.createdAt, timeZone);
  const openSteps = task.steps.filter((step) => step.status !== "done").length;
  const deadlineLocal = task.deadline ? toLocalDateTime(task.deadline, timeZone) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* A fixed label: a long task title would overflow a button (the title is shown under it). */}
      <BackLink href={isStep && task.parent ? `/tasks/${task.parent.id}` : "/tasks"}>
        {isStep && task.parent ? "Back to parent task" : "Back to tasks"}
      </BackLink>

      <header className="space-y-2">
        {isStep && task.parent ? (
          <p className="text-sm text-muted-foreground">Step of: {task.parent.title}</p>
        ) : null}
        <h1 className="text-2xl font-semibold break-words text-brand">{task.title}</h1>
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
      </header>

      {deleted ? (
        // A deleted task shows no action buttons, only the way back.
        <div role="status" className="space-y-3 rounded-lg border border-dashed bg-card p-4">
          <p className="font-medium">This {isStep ? "step" : "task"} is deleted.</p>
          <p className="text-sm text-muted-foreground">
            Restore it to work on it again.
          </p>
          {task.restoreBlocked ? (
            <p className="text-sm font-medium">{task.restoreBlocked}</p>
          ) : null}
          <RestoreButton taskId={task.id} blockedReason={task.restoreBlocked} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {task.status === "todo" ? (
            <>
              <StartButton taskId={task.id} />
              {/* To Do straight to Done is allowed (data-flows.md §2); a task never started then asks "When did you start?". */}
              <DoneButton
                taskId={task.id}
                openSteps={openSteps}
                minDate={minDate}
                maxDate={maxDate}
                variant="secondary"
              />
            </>
          ) : null}
          {task.status === "in_progress" ? (
            <>
              <DoneButton
                taskId={task.id}
                openSteps={openSteps}
                minDate={minDate}
                maxDate={maxDate}
              />
              <MoveBackButton taskId={task.id} />
            </>
          ) : null}
          {task.status === "done" ? <ReopenButton taskId={task.id} /> : null}
          {isStep ? (
            <EditStepDialog
              taskId={task.id}
              title={task.title}
              estimateMinutes={task.estimateMinutes}
              size="default"
            />
          ) : (
            <EditTaskDialog
              taskId={task.id}
              defaults={{
                title: task.title,
                description: task.description,
                category: task.category,
                categoryOther: task.categoryOther,
                priority: task.priority,
                estimateMinutes: task.estimateMinutes,
              }}
            />
          )}
          {task.status !== "done" ? (
            <ChangeDeadlineDialog
              taskId={task.id}
              timeZone={timeZone}
              currentDate={deadlineLocal?.date ?? ""}
              currentTime={deadlineLocal?.time ?? ""}
              label={deadlineLocal ? "Change deadline" : "Set deadline"}
            />
          ) : null}
          <DeleteButton
            taskId={task.id}
            label={isStep ? "Delete step" : "Delete task"}
            noun={isStep ? "Step" : "Task"}
            onDeletedGoTo={task.parent ? `/tasks/${task.parent.id}` : "/tasks"}
          />
        </div>
      )}
      {!deleted && task.status === "done" ? (
        <p className="text-sm text-muted-foreground">Reopen the task to change its deadline.</p>
      ) : null}

      <dl className="grid gap-x-6 gap-y-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
        <Detail label="Deadline">
          {task.deadline ? (
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="size-3.5" aria-hidden="true" />
              {formatDeadline(task.deadline, timeZone)}
            </span>
          ) : (
            "No deadline"
          )}
        </Detail>
        {task.rescheduleCount > 0 && task.originalDeadline ? (
          <Detail label="Rescheduled">
            Moved later {task.rescheduleCount} {task.rescheduleCount === 1 ? "time" : "times"}.
            First deadline: {formatDeadline(task.originalDeadline, timeZone)}
          </Detail>
        ) : null}
        <Detail label="Estimate">
          {task.estimateMinutes ? `${task.estimateMinutes} minutes` : "No estimate"}
        </Detail>
        <Detail label="Created">{formatDeadline(task.createdAt, timeZone)}</Detail>
        <Detail label="Started">
          {task.startedAt ? formatDeadline(task.startedAt, timeZone) : "Not started"}
        </Detail>
        {task.completedAt ? (
          <Detail label="Finished">
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3.5" aria-hidden="true" />
              {formatDeadline(task.completedAt, timeZone)}
            </span>
          </Detail>
        ) : null}
      </dl>

      {task.description ? (
        // User text is always plain text (CLAUDE.md security rule 9).
        <section className="space-y-1">
          <h2 className="font-medium">Description</h2>
          <p className="text-sm break-words whitespace-pre-wrap">{task.description}</p>
        </section>
      ) : null}

      {!isStep ? (
        <section className="space-y-3" aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="text-lg font-semibold">
            Steps
            {task.steps.length > 0
              ? ` (${task.steps.length - openSteps} of ${task.steps.length} done)`
              : ""}
          </h2>
          {task.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps yet.</p>
          ) : (
            <ul className="space-y-2">
              {task.steps.map((step) => (
                <StepRow
                  key={step.id}
                  step={step}
                  timeZone={timeZone}
                  disabled={deleted}
                  parentDone={task.status === "done"}
                />
              ))}
            </ul>
          )}
          {!deleted && task.status === "done" ? (
            <p className="text-sm text-muted-foreground">Reopen the task to add steps.</p>
          ) : null}
          {!deleted && task.status !== "done" ? (
            <AddStepForm
              parentId={task.id}
              parentDeadlineDate={localDateOf(task.deadline, timeZone)}
              timeZone={timeZone}
            />
          ) : null}
        </section>
      ) : null}

      <StartPromptHost />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function StepRow({
  step,
  timeZone,
  disabled,
  parentDone,
}: {
  step: StepDetail;
  timeZone: string;
  disabled: boolean;
  parentDone: boolean;
}) {
  const overdue = isOverdue(step.deadline, step.status);
  return (
    // The whole row opens the step (a "stretched link": the title link covers the row, the buttons sit above it).
    <li className="relative flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <Link
          href={`/tasks/${step.id}`}
          className="flex items-center gap-1 font-medium break-words hover:underline after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {step.title}
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <StatusBadge status={step.status} />
          {overdue ? <OverdueBadge /> : null}
          {step.deadline ? <span>Due {formatDeadline(step.deadline, timeZone)}</span> : null}
          {step.estimateMinutes ? <span>{step.estimateMinutes} min</span> : null}
        </div>
      </div>
      {disabled ? null : (
        <div className="relative z-10 flex shrink-0 flex-wrap gap-2">
          {step.status === "todo" ? <StartButton taskId={step.id} size="sm" /> : null}
          {step.status !== "done" ? (
            // A step never asks "When did you start?", so the window is unused.
            <DoneButton taskId={step.id} openSteps={0} minDate="" maxDate="" size="sm" />
          ) : null}
          {step.status === "done" && !parentDone ? <ReopenButton taskId={step.id} size="sm" /> : null}
          <EditStepDialog taskId={step.id} title={step.title} estimateMinutes={step.estimateMinutes} />
          <DeleteButton taskId={step.id} label="Delete" noun="Step" size="sm" />
        </div>
      )}
    </li>
  );
}
