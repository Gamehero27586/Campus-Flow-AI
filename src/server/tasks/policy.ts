import "server-only";
import { MAX_SUBTASKS_PER_TASK } from "@/config/limits";
import type { TaskCategory, TaskPriority, TaskStatus } from "@/config/task-values";
import {
  allow,
  type Decision,
  notFound,
  stateForbids,
} from "@/server/policies/decision";
import type { RecordRules, RuleContext } from "@/server/policies/evaluate-record";

// The rules for personal tasks and their steps (subtasks), written once. Each rule set answers the two
// questions every domain's policy.ts answers (docs/permissions.md §2):
//   relationship (step 4): is this MY personal task?   Anything else is "not found".
//   state        (step 5): is the task in the right state for this action?
// The server actions run these through authorizeRecord(); the commands run the same functions again on the
// row they lock inside their transaction, so a change made a moment ago (another tab) is caught too.
//
// Personal tasks are tier 1 data (docs/permissions.md §4): only the owner reads or changes them. These
// rules never look at an Admin permission, on purpose, and there is no permission key that would allow it.
// The state rules are docs/data-flows.md §2 and the owner-confirmed rules R-a to R-i in
// docs/slices/slice-3-plan.md §3.

/** One personal task (or step), with just what the rules need. Built by queries.ts findTaskTarget(). */
export type TaskTarget = {
  id: string;
  context: "personal" | "assignment" | "team";
  assigneeId: string | null;
  createdAt: Date;
  /** Null for a top-level task, the parent's id for a step. */
  parentTaskId: string | null;
  title: string;
  category: TaskCategory;
  categoryOther: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: Date | null;
  originalDeadline: Date | null;
  rescheduleCount: number;
  estimateMinutes: number | null;
  estimateSource: "user" | "history" | "ai" | null;
  startedAt: Date | null;
  completedAt: Date | null;
  deletedAt: Date | null;
  /** The parent of a step. */
  parent: {
    id: string;
    status: TaskStatus;
    startedAt: Date | null;
    deletedAt: Date | null;
  } | null;
  /** Steps that are not deleted, and how many of them are not done. Both are 0 for a step. */
  stepCount: number;
  openStepCount: number;
};

type Context = RuleContext<TaskTarget>;

function ownPersonalTask({ user, record }: Context): Decision {
  // The query already scopes to the owner; this is the same rule again, so a loader that forgot to
  // scope would still not let someone else's task through. Anyone else's task does not exist for them.
  return record.context === "personal" && record.assigneeId === user.id ? allow : notFound();
}

function notDeleted({ record }: Context): Decision {
  return record.deletedAt === null
    ? allow
    : stateForbids("task_deleted", "This task is deleted. Restore it first.");
}

/** Builds rule sets: the relationship rule is the same for every action. */
function rules(state: (context: Context) => Decision): RecordRules<TaskTarget> {
  return { relationship: ownPersonalTask, state };
}

/** Runs the checks one after the other and stops at the first refusal. */
function all(...checks: Array<(context: Context) => Decision>) {
  return (context: Context): Decision => {
    for (const check of checks) {
      const decision = check(context);
      if (!decision.allow) return decision;
    }
    return allow;
  };
}

const isTopLevel = (message: string, code = "is_step") => ({ record }: Context): Decision =>
  record.parentTaskId === null ? allow : stateForbids(code, message);

// ---- Editing -------------------------------------------------------------------------------------

/** Title, description, category, priority, estimate of a top-level task. */
export const updateTaskRules = () =>
  rules(all(notDeleted, isTopLevel("A step has only a title and an estimate.")));

/** Title and estimate of a step (category and priority follow the parent, rule R-d). */
export const updateSubtaskRules = () =>
  rules(
    all(notDeleted, ({ record }) =>
      record.parentTaskId !== null
        ? allow
        : stateForbids("not_a_step", "That task is not a step of another task."),
    ),
  );

/** Moving the deadline later or earlier (it cannot be removed, see the schema). */
export const changeDeadlineRules = () => rules(notDeleted);

/** Adding a step to a task. `record` is the PARENT here. Rules R-b and the 30-step limit. */
export const addSubtaskRules = () =>
  rules(
    all(
      notDeleted,
      isTopLevel("A step cannot have its own steps.", "step_of_step"),
      ({ record }) =>
        record.status === "done"
          ? stateForbids("parent_done", "Reopen the task to add steps.")
          : allow,
      ({ record }) =>
        record.stepCount >= MAX_SUBTASKS_PER_TASK
          ? stateForbids(
              "too_many_steps",
              `A task can have at most ${MAX_SUBTASKS_PER_TASK} steps.`,
            )
          : allow,
    ),
  );

// ---- Status --------------------------------------------------------------------------------------

/** To Do to In progress. */
export const startRules = () =>
  rules(
    all(notDeleted, ({ record }) => {
      if (record.status === "todo") return allow;
      return record.status === "done"
        ? stateForbids("task_done", "This task is already done.")
        : stateForbids("already_started", "This task is already in progress.");
    }),
  );

/** In progress back to To Do. */
export const moveBackToTodoRules = () =>
  rules(
    all(notDeleted, ({ record }) =>
      record.status === "in_progress"
        ? allow
        : stateForbids("not_in_progress", "Only a task that is in progress can move back to To Do."),
    ),
  );

/**
 * To Done. A parent with steps that are not done needs the explicit "complete all" choice
 * (data-flows.md §2); completing the steps does not happen by itself.
 */
export const completeRules = (completeAllSteps: boolean) =>
  rules(
    all(
      notDeleted,
      ({ record }) =>
        record.status === "done"
          ? stateForbids("already_done", "This task is already done.")
          : allow,
      ({ record }) => {
        if (record.openStepCount === 0 || completeAllSteps) return allow;
        const steps = record.openStepCount === 1 ? "1 step is" : `${record.openStepCount} steps are`;
        return stateForbids("open_steps", `${steps} not done. Complete them too, or finish them first.`);
      },
    ),
  );

/** Done back to To Do or In progress. Rule R-c: not a step of a Done parent. */
export const reopenRules = () =>
  rules(
    all(
      notDeleted,
      ({ record }) =>
        record.status === "done"
          ? allow
          : stateForbids("not_done", "Only a finished task can be reopened."),
      ({ record }) =>
        record.parent?.status === "done"
          ? stateForbids("parent_done", "Reopen the task first.")
          : allow,
    ),
  );

/**
 * "When did you start?" (data-flows.md §2): only on a finished task that has no start yet, and the start
 * must lie between creation and the finish. `window` is given by the command once it has turned the
 * local date and time into an instant; the action's first check runs without it.
 */
export const backfillStartRules = (window: { startedAt: Date; now: Date } | null) =>
  rules(
    all(
      notDeleted,
      ({ record }) =>
        record.status === "done"
          ? allow
          : stateForbids("not_done", "You can only add a start time to a finished task."),
      ({ record }) =>
        record.startedAt === null
          ? allow
          : stateForbids("start_already_set", "This task already has a start time."),
      ({ record }) => {
        if (!window) return allow;
        const { startedAt, now } = window;
        if (startedAt.getTime() < record.createdAt.getTime()) {
          return stateForbids("start_too_early", "The start cannot be before the task was created.");
        }
        if (record.completedAt && startedAt.getTime() > record.completedAt.getTime()) {
          return stateForbids("start_after_finish", "The start cannot be after the task was finished.");
        }
        if (startedAt.getTime() > now.getTime()) {
          return stateForbids("start_in_future", "The start cannot be in the future.");
        }
        return allow;
      },
    ),
  );

// ---- Delete and restore --------------------------------------------------------------------------

/** Soft delete. A parent takes its steps with it (rule R-f). */
export const deleteRules = () =>
  rules(({ record }) =>
    record.deletedAt === null
      ? allow
      : stateForbids("already_deleted", "This task is already deleted."),
  );

/**
 * Restore. Rule R-g: a step cannot come back while its parent is still deleted. Also: a step that is not
 * done cannot come back into a Done parent (a Done parent must have every step done, data-model.md §4),
 * the same reason as R-b and R-c.
 */
export const restoreRules = () =>
  rules(
    all(
      ({ record }) =>
        record.deletedAt !== null
          ? allow
          : stateForbids("not_deleted", "This task is not deleted."),
      ({ record }) =>
        record.parent?.deletedAt ? stateForbids("parent_deleted", "Restore the task first.") : allow,
      ({ record }) =>
        record.parent?.status === "done" && record.status !== "done"
          ? stateForbids("parent_done", "Reopen the task first.")
          : allow,
    ),
  );
