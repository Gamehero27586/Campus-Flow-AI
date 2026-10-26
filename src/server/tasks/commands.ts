import "server-only";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { MAX_SUBTASKS_PER_TASK } from "@/config/limits";
import type { TaskStatus } from "@/config/task-values";
import { fail, type Failure, ok } from "@/lib/result";
import type {
  BackfillStartInput,
  ChangeDeadlineInput,
  CompleteTaskInput,
  CreateSubtaskInput,
  CreateTaskInput,
  ReopenTaskInput,
  TaskActionInput,
  UpdateSubtaskInput,
  UpdateTaskInput,
} from "@/lib/schemas/tasks";
import { now } from "@/lib/time";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { taskEvents, tasks } from "@/server/db/schema";
import { decisionToFailure } from "@/server/policies/decision";
import { type RecordRules, runRules } from "@/server/policies/evaluate-record";
import {
  addSubtaskRules,
  backfillStartRules,
  changeDeadlineRules,
  completeRules,
  deleteRules,
  moveBackToTodoRules,
  reopenRules,
  restoreRules,
  startRules,
  type TaskTarget,
  updateSubtaskRules,
  updateTaskRules,
} from "@/server/tasks/policy";
import { findTaskTarget, ownPersonalTask } from "@/server/tasks/queries";
import { localToUtc } from "@/server/tasks/time";

// The ONLY place that writes `tasks` and `task_events` (the seed script is the one allowed exception).
// The task timestamp rules (docs/data-flows.md §2) live here and nowhere else.
//
// The caller (a server action) has already run authorizeRecord() with task.personal.manage. Each command
// then, in ONE transaction:
//   1. locks the task row (and its parent's, parent first, so two commands cannot deadlock) with
//      SELECT ... FOR UPDATE. This is why the driver is `pg`;
//   2. reads the task again and runs the same rules on that locked row, so a change made a moment ago
//      (another tab) is caught: the second click is checked against the CURRENT status, not the page's copy;
//   3. writes, and adds the task_events rows.
// Every timestamp comes from the app clock, now(), taken once per command: created_at and updated_at
// included, so a fixed test clock gives one consistent set of instants (docs/reviews/slice-3a-opus-review.md A1).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Personal-task rules read no permission (the action already checked the key), so the commands pass none.
const NO_PERMISSIONS: ReadonlySet<string> = new Set();

type EventType = (typeof taskEvents.$inferInsert)["eventType"];
type NewEvent = {
  taskId: string;
  eventType: EventType;
  fromValue?: string | null;
  toValue?: string | null;
};

async function writeEvents(tx: Tx, actor: CurrentUser, at: Date, events: NewEvent[]) {
  if (events.length === 0) return;
  await tx.insert(taskEvents).values(
    events.map((event) => ({
      taskId: event.taskId,
      actorId: actor.id,
      eventType: event.eventType,
      fromValue: event.fromValue ?? null,
      toValue: event.toValue ?? null,
      createdAt: at,
    })),
  );
}

/** Locks the task (its parent first), then reads it. Null when it is not this user's personal task. */
async function lockTask(tx: Tx, userId: string, taskId: string): Promise<TaskTarget | null> {
  const [row] = await tx
    .select({ parentId: tasks.parentTaskId })
    .from(tasks)
    .where(ownPersonalTask(userId, taskId));
  if (!row) return null;
  if (row.parentId) {
    await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, row.parentId)).for("update");
  }
  await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).for("update");
  return findTaskTarget(tx, userId, taskId);
}

/** Locks, reads and applies a rule set. Returns the locked task, or the failure to hand back. */
async function lockAndCheck(
  tx: Tx,
  actor: CurrentUser,
  taskId: string,
  rules: RecordRules<TaskTarget>,
): Promise<{ target: TaskTarget } | { failure: Failure }> {
  const target = await lockTask(tx, actor.id, taskId);
  if (!target) return { failure: fail("not_found", "That task was not found.") };
  const decision = runRules(rules, { user: actor, permissions: NO_PERMISSIONS, record: target });
  if (!decision.allow) return { failure: decisionToFailure(decision) };
  return { target };
}

/** A whole command on one task: lock, check, then `run` with the locked task and the command's clock. */
async function onLockedTask<TResult>(
  actor: CurrentUser,
  taskId: string,
  rules: RecordRules<TaskTarget>,
  run: (context: { tx: Tx; target: TaskTarget; at: Date }) => Promise<TResult>,
): Promise<TResult | Failure> {
  return db.transaction(async (tx) => {
    const checked = await lockAndCheck(tx, actor, taskId, rules);
    if ("failure" in checked) return checked.failure;
    return run({ tx, target: checked.target, at: now() });
  });
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

async function deadlineFrom(
  tx: Tx,
  actor: CurrentUser,
  date: string | null,
  time: string | null,
): Promise<Date | null> {
  return date ? localToUtc(tx, date, time, actor.timezone) : null;
}

// ---- Create --------------------------------------------------------------------------------------

/** A new personal task, with optional steps typed along with it. */
export async function createTask(actor: CurrentUser, input: CreateTaskInput) {
  if (input.steps.length > MAX_SUBTASKS_PER_TASK) {
    return fail("too_many_steps", `A task can have at most ${MAX_SUBTASKS_PER_TASK} steps.`);
  }

  return db.transaction(async (tx) => {
    const at = now();
    const deadline = await deadlineFrom(tx, actor, input.deadlineDate, input.deadlineTime);

    const [task] = await tx
      .insert(tasks)
      .values({
        context: "personal",
        createdBy: actor.id,
        assigneeId: actor.id,
        title: input.title,
        description: input.description,
        category: input.category,
        categoryOther: input.categoryOther,
        priority: input.priority,
        deadline,
        originalDeadline: deadline,
        estimateMinutes: input.estimateMinutes,
        estimateSource: input.estimateMinutes === null ? null : "user",
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: tasks.id });

    const events: NewEvent[] = [{ taskId: task.id, eventType: "created" }];
    if (input.steps.length > 0) {
      const steps = await tx
        .insert(tasks)
        .values(
          input.steps.map((title) => ({
            context: "personal" as const,
            createdBy: actor.id,
            assigneeId: actor.id,
            parentTaskId: task.id,
            title,
            category: input.category,
            categoryOther: input.categoryOther,
            priority: input.priority,
            createdAt: at,
            updatedAt: at,
          })),
        )
        .returning({ id: tasks.id });
      for (const step of steps) events.push({ taskId: step.id, eventType: "created" });
    }
    await writeEvents(tx, actor, at, events);

    return ok({ taskId: task.id });
  });
}

/**
 * A new step under a task. A step copies the parent's context, owner, category and priority (rule R-d).
 * `input.taskId` is the PARENT.
 */
export async function createSubtask(actor: CurrentUser, input: CreateSubtaskInput) {
  return onLockedTask(actor, input.taskId, addSubtaskRules(), async ({ tx, target: parent, at }) => {
    const deadline = await deadlineFrom(tx, actor, input.deadlineDate, input.deadlineTime);
    const [step] = await tx
      .insert(tasks)
      .values({
        context: "personal",
        createdBy: actor.id,
        assigneeId: actor.id,
        parentTaskId: parent.id,
        title: input.title,
        category: parent.category,
        categoryOther: parent.categoryOther,
        priority: parent.priority,
        deadline,
        originalDeadline: deadline,
        estimateMinutes: input.estimateMinutes,
        estimateSource: input.estimateMinutes === null ? null : "user",
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: tasks.id });
    await writeEvents(tx, actor, at, [{ taskId: step.id, eventType: "created" }]);
    return ok({ taskId: step.id });
  });
}

// ---- Edit ----------------------------------------------------------------------------------------

/** The estimate keeps its source when the number did not change, otherwise it is the user's own number. */
function estimateColumns(target: TaskTarget, estimateMinutes: number | null) {
  if (estimateMinutes === target.estimateMinutes) {
    return { estimateMinutes: target.estimateMinutes, estimateSource: target.estimateSource };
  }
  return { estimateMinutes, estimateSource: estimateMinutes === null ? null : ("user" as const) };
}

/** Title, description, category, priority and estimate of a top-level task. Steps follow category and priority. */
export async function updateTask(actor: CurrentUser, input: UpdateTaskInput) {
  return onLockedTask(actor, input.taskId, updateTaskRules(), async ({ tx, target, at }) => {
    await tx
      .update(tasks)
      .set({
        title: input.title,
        description: input.description,
        category: input.category,
        categoryOther: input.categoryOther,
        priority: input.priority,
        ...estimateColumns(target, input.estimateMinutes),
        updatedAt: at,
      })
      .where(eq(tasks.id, target.id));

    const categoryChanged =
      input.category !== target.category || input.categoryOther !== target.categoryOther;
    if (categoryChanged || input.priority !== target.priority) {
      // Every step, deleted ones too, so a restored step matches its parent (rule R-d).
      await tx
        .update(tasks)
        .set({
          category: input.category,
          categoryOther: input.categoryOther,
          priority: input.priority,
          updatedAt: at,
        })
        .where(eq(tasks.parentTaskId, target.id));
    }
    return ok({ taskId: target.id });
  });
}

/** Title and estimate of a step. */
export async function updateSubtask(actor: CurrentUser, input: UpdateSubtaskInput) {
  return onLockedTask(actor, input.taskId, updateSubtaskRules(), async ({ tx, target, at }) => {
    await tx
      .update(tasks)
      .set({
        title: input.title,
        ...estimateColumns(target, input.estimateMinutes),
        updatedAt: at,
      })
      .where(eq(tasks.id, target.id));
    return ok({ taskId: target.id });
  });
}

/**
 * Moves a deadline (docs/data-flows.md §2): `original_deadline` is set the first time a deadline is set,
 * and `reschedule_count` goes up only when the deadline moves LATER. Moving it earlier, or to the same
 * instant, does not count as a reschedule.
 */
export async function changeDeadline(actor: CurrentUser, input: ChangeDeadlineInput) {
  return onLockedTask(actor, input.taskId, changeDeadlineRules(), async ({ tx, target, at }) => {
    const deadline = (await deadlineFrom(tx, actor, input.deadlineDate, input.deadlineTime)) as Date;
    if (target.deadline && target.deadline.getTime() === deadline.getTime()) {
      return ok({ taskId: target.id, changed: false });
    }

    const movedLater = target.deadline !== null && deadline.getTime() > target.deadline.getTime();
    await tx
      .update(tasks)
      .set({
        deadline,
        originalDeadline: target.originalDeadline ?? deadline,
        rescheduleCount: movedLater ? target.rescheduleCount + 1 : target.rescheduleCount,
        updatedAt: at,
      })
      .where(eq(tasks.id, target.id));
    await writeEvents(tx, actor, at, [
      {
        taskId: target.id,
        eventType: "deadline_changed",
        fromValue: iso(target.deadline),
        toValue: iso(deadline),
      },
    ]);
    return ok({ taskId: target.id, changed: true });
  });
}

// ---- Status --------------------------------------------------------------------------------------

/**
 * To Do to In progress. `started_at` is set if empty and never overwritten. Rule R-a: starting a step
 * while its parent is To Do also starts the parent, at the same moment, with its own event.
 */
export async function startTask(actor: CurrentUser, input: TaskActionInput) {
  return onLockedTask(actor, input.taskId, startRules(), async ({ tx, target, at }) => {
    await tx
      .update(tasks)
      .set({ status: "in_progress", startedAt: target.startedAt ?? at, updatedAt: at })
      .where(and(eq(tasks.id, target.id), eq(tasks.status, "todo")));
    const events: NewEvent[] = [
      { taskId: target.id, eventType: "status_changed", fromValue: "todo", toValue: "in_progress" },
    ];

    if (target.parent && target.parent.status === "todo") {
      await tx
        .update(tasks)
        .set({ status: "in_progress", startedAt: target.parent.startedAt ?? at, updatedAt: at })
        .where(and(eq(tasks.id, target.parent.id), eq(tasks.status, "todo")));
      events.push({
        taskId: target.parent.id,
        eventType: "status_changed",
        fromValue: "todo",
        toValue: "in_progress",
      });
    }
    await writeEvents(tx, actor, at, events);
    return ok({ taskId: target.id });
  });
}

/** In progress back to To Do. `started_at` is kept. */
export async function moveBackToTodo(actor: CurrentUser, input: TaskActionInput) {
  return onLockedTask(actor, input.taskId, moveBackToTodoRules(), async ({ tx, target, at }) => {
    await tx
      .update(tasks)
      .set({ status: "todo", updatedAt: at })
      .where(and(eq(tasks.id, target.id), eq(tasks.status, "in_progress")));
    await writeEvents(tx, actor, at, [
      { taskId: target.id, eventType: "status_changed", fromValue: "in_progress", toValue: "todo" },
    ]);
    return ok({ taskId: target.id });
  });
}

/**
 * To Done. Sets `completed_at`. A task with steps that are not done needs `completeAllSteps` (checked by
 * the rules); the steps then complete at the same instant. Completing the last step never completes the
 * parent by itself. `askStartTime` tells the screen to ask "When did you start?" once, for a top-level task
 * that was never started.
 */
export async function completeTask(actor: CurrentUser, input: CompleteTaskInput) {
  return onLockedTask(
    actor,
    input.taskId,
    completeRules(input.completeAllSteps),
    async ({ tx, target, at }) => {
      const events: NewEvent[] = [];

      if (target.openStepCount > 0) {
        const open = await tx
          .select({ id: tasks.id, status: tasks.status })
          .from(tasks)
          .where(
            and(
              eq(tasks.parentTaskId, target.id),
              isNull(tasks.deletedAt),
              ne(tasks.status, "done"),
            ),
          )
          .for("update");
        if (open.length > 0) {
          await tx
            .update(tasks)
            .set({ status: "done", completedAt: at, updatedAt: at })
            .where(
              inArray(
                tasks.id,
                open.map((step) => step.id),
              ),
            );
          for (const step of open) {
            events.push({
              taskId: step.id,
              eventType: "status_changed",
              fromValue: step.status,
              toValue: "done",
            });
          }
        }
      }

      await tx
        .update(tasks)
        .set({ status: "done", completedAt: at, updatedAt: at })
        .where(and(eq(tasks.id, target.id), ne(tasks.status, "done")));
      events.push({
        taskId: target.id,
        eventType: "status_changed",
        fromValue: target.status,
        toValue: "done",
      });
      await writeEvents(tx, actor, at, events);

      return ok({
        taskId: target.id,
        askStartTime: target.parentTaskId === null && target.startedAt === null,
      });
    },
  );
}

/**
 * Done back to In progress (the default) or To Do. `completed_at` is cleared and `started_at` kept;
 * reopening to In progress a task that never had a start gives it one now, the first time its status is
 * In progress. Rule R-c (a step of a Done parent) is in the rules.
 */
export async function reopenTask(actor: CurrentUser, input: ReopenTaskInput) {
  return onLockedTask(actor, input.taskId, reopenRules(), async ({ tx, target, at }) => {
    const to: TaskStatus = input.to;
    await tx
      .update(tasks)
      .set({
        status: to,
        completedAt: null,
        startedAt: to === "in_progress" ? (target.startedAt ?? at) : target.startedAt,
        updatedAt: at,
      })
      .where(and(eq(tasks.id, target.id), eq(tasks.status, "done")));
    await writeEvents(tx, actor, at, [
      { taskId: target.id, eventType: "reopened", fromValue: "done", toValue: to },
    ]);
    return ok({ taskId: target.id });
  });
}

/**
 * "When did you start?": sets `started_at` on a finished task that has none. The local date and time
 * become a UTC instant the same way as a deadline. The start must lie between `created_at` and
 * `completed_at` and not in the future; the rules check that on the locked row.
 */
export async function backfillStart(actor: CurrentUser, input: BackfillStartInput) {
  return db.transaction(async (tx) => {
    const startedAt = await localToUtc(tx, input.startDate, input.startTime, actor.timezone);
    const at = now();
    const checked = await lockAndCheck(
      tx,
      actor,
      input.taskId,
      backfillStartRules({ startedAt, now: at }),
    );
    if ("failure" in checked) return checked.failure;
    const { target } = checked;

    await tx
      .update(tasks)
      .set({ startedAt, updatedAt: at })
      .where(and(eq(tasks.id, target.id), isNull(tasks.startedAt)));
    await writeEvents(tx, actor, at, [
      { taskId: target.id, eventType: "start_backfilled", fromValue: null, toValue: startedAt.toISOString() },
    ]);
    return ok({ taskId: target.id });
  });
}

// ---- Delete and restore --------------------------------------------------------------------------

/**
 * Soft delete (`deleted_reason = user_deleted`). Rule R-f: deleting a parent soft-deletes its steps with
 * it, with the same `deleted_at`, and one `deleted` event each. Nothing is ever hard-deleted.
 */
export async function deleteTask(actor: CurrentUser, input: TaskActionInput) {
  return onLockedTask(actor, input.taskId, deleteRules(), async ({ tx, target, at }) => {
    const steps =
      target.parentTaskId === null
        ? await tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.parentTaskId, target.id), isNull(tasks.deletedAt)))
            .for("update")
        : [];
    const ids = [target.id, ...steps.map((step) => step.id)];

    await tx
      .update(tasks)
      .set({ deletedAt: at, deletedReason: "user_deleted", updatedAt: at })
      .where(and(inArray(tasks.id, ids), isNull(tasks.deletedAt)));
    await writeEvents(
      tx,
      actor,
      at,
      ids.map((taskId) => ({ taskId, eventType: "deleted" as const })),
    );
    return ok({ taskId: target.id });
  });
}

/**
 * Brings a deleted task back (rules R-g and R-h). Restoring a parent also restores the steps deleted at
 * the same moment (equal `deleted_at`), not steps deleted earlier on their own. The task then counts
 * normally in metrics, because data-flows.md §7.1 looks only at the current deletion state.
 */
export async function restoreTask(actor: CurrentUser, input: TaskActionInput) {
  return onLockedTask(actor, input.taskId, restoreRules(), async ({ tx, target, at }) => {
    const deletedAt = target.deletedAt as Date;
    const ids = [target.id];

    if (target.parentTaskId === null) {
      const steps = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.parentTaskId, target.id), eq(tasks.deletedAt, deletedAt)))
        .for("update");
      ids.push(...steps.map((step) => step.id));
    }

    await tx
      .update(tasks)
      .set({ deletedAt: null, deletedReason: null, updatedAt: at })
      .where(inArray(tasks.id, ids));
    await writeEvents(
      tx,
      actor,
      at,
      ids.map((taskId) => ({ taskId, eventType: "restored" as const })),
    );
    return ok({ taskId: target.id });
  });
}
