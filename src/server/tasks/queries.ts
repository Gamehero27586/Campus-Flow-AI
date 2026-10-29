import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { TaskCategory, TaskPriority, TaskStatus } from "@/config/task-values";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { tasks } from "@/server/db/schema";
import { restoreBlock, type TaskTarget } from "@/server/tasks/policy";
import type { RecordScope } from "@/server/policies/evaluate-record";

// Every query here is scoped to the signed-in user IN THE QUERY: context = 'personal' AND
// assignee_id = the user. Nothing reads a personal task by id alone (CLAUDE.md security rule 3), and
// nothing here ever looks at an Admin permission: personal tasks are tier 1 (docs/permissions.md §4).
// Queries select only the columns a screen needs and return plain objects.

/** Either the database or a transaction on it: both can run the same select. */
type Executor = Pick<typeof db, "select">;

/** The scope: this user's own personal task with this id. */
export function ownPersonalTask(userId: string, taskId: string) {
  return and(eq(tasks.id, taskId), eq(tasks.context, "personal"), eq(tasks.assigneeId, userId));
}

const parentTask = alias(tasks, "parent_task");
const stepTask = alias(tasks, "step_task");
// In the step counts below the outer table is written out as "tasks"."id": Drizzle leaves the table name off a
// column in a query without a join, and then the subquery would compare the step with itself.

/**
 * One task with what the rules need (see policy.ts). Deleted tasks are included, because restoring one
 * needs it. The commands call this inside their transaction after locking the row; loadPersonalTask()
 * below is the same read for the actions.
 */
export async function findTaskTarget(
  executor: Executor,
  userId: string,
  taskId: string,
): Promise<TaskTarget | null> {
  const [row] = await executor
    .select({
      id: tasks.id,
      context: tasks.context,
      assigneeId: tasks.assigneeId,
      createdAt: tasks.createdAt,
      parentTaskId: tasks.parentTaskId,
      title: tasks.title,
      category: tasks.category,
      categoryOther: tasks.categoryOther,
      priority: tasks.priority,
      status: tasks.status,
      deadline: tasks.deadline,
      originalDeadline: tasks.originalDeadline,
      rescheduleCount: tasks.rescheduleCount,
      estimateMinutes: tasks.estimateMinutes,
      estimateSource: tasks.estimateSource,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
      deletedAt: tasks.deletedAt,
      parentId: parentTask.id,
      parentStatus: parentTask.status,
      parentStartedAt: parentTask.startedAt,
      parentDeletedAt: parentTask.deletedAt,
      stepCount: sql<number>`(select count(*) from "tasks" "step_task" where ${stepTask.parentTaskId} = "tasks"."id" and ${stepTask.deletedAt} is null)::int`,
      openStepCount: sql<number>`(select count(*) from "tasks" "step_task" where ${stepTask.parentTaskId} = "tasks"."id" and ${stepTask.deletedAt} is null and ${stepTask.status} <> 'done')::int`,
    })
    .from(tasks)
    .leftJoin(parentTask, eq(parentTask.id, tasks.parentTaskId))
    .where(ownPersonalTask(userId, taskId));
  if (!row) return null;

  const { parentId, parentStatus, parentStartedAt, parentDeletedAt, ...task } = row;
  return {
    ...task,
    parent: parentId
      ? {
          id: parentId,
          // A left join gives null columns only when there is no parent, so these are set here.
          status: parentStatus as TaskStatus,
          startedAt: parentStartedAt,
          deletedAt: parentDeletedAt,
        }
      : null,
  };
}

/** The record loader for the task actions: the user's own personal task, or nothing. */
export async function loadPersonalTask(
  scope: RecordScope,
  taskId: string,
): Promise<TaskTarget | null> {
  return findTaskTarget(db, scope.user.id, taskId);
}

// ---- Lists and details for the screens -------------------------------------------------------------

export type TaskListFilter = "open" | "done" | "all";

export type TaskListItem = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  categoryOther: string | null;
  deadline: Date | null;
  createdAt: Date;
  stepsDone: number;
  stepsTotal: number;
};

/** The user's top-level tasks that are not deleted, soonest deadline first (no deadline last), then oldest. */
export async function listMyTasks(user: CurrentUser, filter: TaskListFilter): Promise<TaskListItem[]> {
  const statusFilter =
    filter === "open"
      ? ne(tasks.status, "done")
      : filter === "done"
        ? eq(tasks.status, "done")
        : undefined;

  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      category: tasks.category,
      categoryOther: tasks.categoryOther,
      deadline: tasks.deadline,
      createdAt: tasks.createdAt,
      stepsTotal: sql<number>`(select count(*) from "tasks" "step_task" where ${stepTask.parentTaskId} = "tasks"."id" and ${stepTask.deletedAt} is null)::int`,
      stepsDone: sql<number>`(select count(*) from "tasks" "step_task" where ${stepTask.parentTaskId} = "tasks"."id" and ${stepTask.deletedAt} is null and ${stepTask.status} = 'done')::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.context, "personal"),
        eq(tasks.assigneeId, user.id),
        isNull(tasks.parentTaskId),
        isNull(tasks.deletedAt),
        statusFilter,
      ),
    )
    .orderBy(sql`${tasks.deadline} asc nulls last`, asc(tasks.createdAt));
}

export type StepDetail = {
  id: string;
  title: string;
  status: TaskStatus;
  deadline: Date | null;
  estimateMinutes: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  categoryOther: string | null;
  deadline: Date | null;
  originalDeadline: Date | null;
  rescheduleCount: number;
  estimateMinutes: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  /** Set for a step: the task it belongs to. */
  parent: { id: string; title: string } | null;
  /** For a deleted step: why it cannot be restored yet ("Restore the task first."), or null. */
  restoreBlocked: string | null;
  /** Steps that are not deleted, oldest first. Empty for a step. */
  steps: StepDetail[];
};

/** One of the user's own personal tasks with its steps, or null (not theirs, or no such task). */
export async function getMyTask(user: CurrentUser, taskId: string): Promise<TaskDetail | null> {
  const [row] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      category: tasks.category,
      categoryOther: tasks.categoryOther,
      deadline: tasks.deadline,
      originalDeadline: tasks.originalDeadline,
      rescheduleCount: tasks.rescheduleCount,
      estimateMinutes: tasks.estimateMinutes,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      deletedAt: tasks.deletedAt,
      parentId: parentTask.id,
      parentTitle: parentTask.title,
      parentStatus: parentTask.status,
      parentDeletedAt: parentTask.deletedAt,
    })
    .from(tasks)
    .leftJoin(parentTask, eq(parentTask.id, tasks.parentTaskId))
    .where(ownPersonalTask(user.id, taskId));
  if (!row) return null;

  const { parentId, parentTitle, parentStatus, parentDeletedAt, ...task } = row;
  const steps = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      deadline: tasks.deadline,
      estimateMinutes: tasks.estimateMinutes,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.context, "personal"),
        eq(tasks.assigneeId, user.id),
        eq(tasks.parentTaskId, task.id),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(tasks.createdAt), asc(tasks.id));

  return {
    ...task,
    parent: parentId && parentTitle !== null ? { id: parentId, title: parentTitle } : null,
    restoreBlocked:
      task.deletedAt !== null && parentStatus
        ? (restoreBlock({
            status: task.status,
            parent: { status: parentStatus, deletedAt: parentDeletedAt },
          })?.message ?? null)
        : null,
    steps,
  };
}

export type DeletedTaskItem = {
  id: string;
  title: string;
  deletedAt: Date;
  /** Set for a deleted step: the task it belongs to, and whether that task is deleted too. */
  parent: { id: string; title: string; deleted: boolean } | null;
  /** Why this cannot be restored yet ("Restore the task first."), or null. The screen disables Restore. */
  restoreBlocked: string | null;
  /**
   * Titles of the steps that were deleted at the same moment as this task. They have no row of their own:
   * restoring the task brings them back (rule R-g), so they are shown inside the task's row.
   */
  stepsDeletedWithIt: string[];
};

/**
 * The user's deleted tasks and steps, most recently deleted first. A step deleted together with its task
 * (the same `deleted_at`) is listed inside the task's row, not as a row of its own. A step deleted on its own
 * keeps its own row, even when its task was deleted later.
 */
export async function listMyDeletedTasks(user: CurrentUser): Promise<DeletedTaskItem[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      deletedAt: tasks.deletedAt,
      parentId: parentTask.id,
      status: tasks.status,
      parentTitle: parentTask.title,
      parentStatus: parentTask.status,
      parentDeletedAt: parentTask.deletedAt,
    })
    .from(tasks)
    .leftJoin(parentTask, eq(parentTask.id, tasks.parentTaskId))
    .where(
      and(eq(tasks.context, "personal"), eq(tasks.assigneeId, user.id), isNotNull(tasks.deletedAt)),
    )
    // A task comes before the steps that were deleted with it (same moment), then oldest first.
    .orderBy(desc(tasks.deletedAt), sql`${tasks.parentTaskId} is not null`, asc(tasks.createdAt));

  const sameMoment = (row: (typeof rows)[number]) =>
    row.parentDeletedAt !== null && row.parentDeletedAt.getTime() === row.deletedAt?.getTime();

  const withTask = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentId && sameMoment(row)) {
      withTask.set(row.parentId, [...(withTask.get(row.parentId) ?? []), row.title]);
    }
  }

  return rows
    .filter((row) => !(row.parentId && sameMoment(row)))
    .map((row) => ({
      id: row.id,
      title: row.title,
      deletedAt: row.deletedAt as Date,
      parent:
        row.parentId && row.parentTitle !== null
          ? { id: row.parentId, title: row.parentTitle, deleted: row.parentDeletedAt !== null }
          : null,
      restoreBlocked:
        row.parentId && row.parentStatus
          ? (restoreBlock({
              status: row.status,
              parent: { status: row.parentStatus, deletedAt: row.parentDeletedAt },
            })?.message ?? null)
          : null,
      stepsDeletedWithIt: withTask.get(row.id) ?? [],
    }));
}
