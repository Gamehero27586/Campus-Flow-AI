"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type FormState } from "@/lib/result";
import {
  backfillStartSchema,
  changeDeadlineSchema,
  completeTaskSchema,
  createSubtaskSchema,
  createTaskSchema,
  reopenTaskSchema,
  taskActionSchema,
  updateSubtaskSchema,
  updateTaskSchema,
} from "@/lib/schemas/tasks";
import { authorize, authorizeRecord } from "@/server/policies/authorize";
import { failureFor } from "@/server/policies/evaluate-record";
import {
  backfillStart,
  changeDeadline,
  completeTask,
  createSubtask,
  createTask,
  deleteTask,
  moveBackToTodo,
  reopenTask,
  restoreTask,
  startTask,
  updateSubtask,
  updateTask,
} from "@/server/tasks/commands";
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
  updateSubtaskRules,
  updateTaskRules,
} from "@/server/tasks/policy";
import { loadPersonalTask } from "@/server/tasks/queries";

// Every action here has the same shape (docs/folder-structure.md §4): parse with Zod, run the full
// five-step check on the task with authorizeRecord(), call ONE command, revalidate, return the result.
// Creating a task has no record yet, so it uses authorize(). The rules are in src/server/tasks/policy.ts.
// Personal tasks are tier 1: the one key is task.personal.manage, and no key lets anyone else in.

const KEY = "task.personal.manage";

const invalid = (error: z.ZodError) =>
  fail("invalid_input", "Check the highlighted fields.", z.flattenError(error).fieldErrors);

/** The pages that show tasks: the list, the detail pages and the Deleted list. */
const revalidateTasks = () => revalidatePath("/tasks", "layout");

export async function createTaskAction(
  _previous: FormState<{ taskId: string }>,
  formData: FormData,
): Promise<FormState<{ taskId: string }>> {
  const parsed = createTaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    categoryOther: formData.get("categoryOther"),
    priority: formData.get("priority"),
    deadlineDate: formData.get("deadlineDate"),
    deadlineTime: formData.get("deadlineTime"),
    estimateMinutes: formData.get("estimateMinutes"),
    steps: formData.getAll("steps"),
  });
  if (!parsed.success) return invalid(parsed.error);

  // There is no record yet, so the check is steps 1 to 3 only.
  const authorization = await authorize(KEY);
  if (!authorization.ok) return fail("not_allowed", "You cannot do that.");

  const result = await createTask(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: "Task created.", data: { taskId: result.data.taskId } };
}

export async function createSubtaskAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createSubtaskSchema.safeParse({
    taskId: formData.get("taskId"),
    title: formData.get("title"),
    deadlineDate: formData.get("deadlineDate"),
    deadlineTime: formData.get("deadlineTime"),
    estimateMinutes: formData.get("estimateMinutes"),
  });
  if (!parsed.success) return invalid(parsed.error);

  // The record is the PARENT: it must be a top-level task of this user that is not done.
  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: addSubtaskRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await createSubtask(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: "Step added." };
}

export async function updateTaskAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateTaskSchema.safeParse({
    taskId: formData.get("taskId"),
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    categoryOther: formData.get("categoryOther"),
    priority: formData.get("priority"),
    estimateMinutes: formData.get("estimateMinutes"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: updateTaskRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await updateTask(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: "Task saved." };
}

export async function updateSubtaskAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateSubtaskSchema.safeParse({
    taskId: formData.get("taskId"),
    title: formData.get("title"),
    estimateMinutes: formData.get("estimateMinutes"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: updateSubtaskRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await updateSubtask(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: "Step saved." };
}

export async function changeDeadlineAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = changeDeadlineSchema.safeParse({
    taskId: formData.get("taskId"),
    deadlineDate: formData.get("deadlineDate"),
    deadlineTime: formData.get("deadlineTime"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: changeDeadlineRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await changeDeadline(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: result.data.changed ? "Deadline changed." : "Deadline unchanged." };
}

/** `parentStarted` is true when starting a step also started its parent (rule R-a): the screen says so. */
export async function startTaskAction(
  _previous: FormState<{ parentStarted: boolean }>,
  formData: FormData,
): Promise<FormState<{ parentStarted: boolean }>> {
  const parsed = taskActionSchema.safeParse({ taskId: formData.get("taskId") });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: startRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await startTask(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return {
    ok: true,
    message: result.data.parentStarted
      ? "Step started. The task was started with it."
      : "Started.",
    data: { parentStarted: result.data.parentStarted },
  };
}

export async function moveBackToTodoAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = taskActionSchema.safeParse({ taskId: formData.get("taskId") });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: moveBackToTodoRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await moveBackToTodo(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: "Moved back to To Do." };
}

/**
 * `askStartTime`: ask "When did you start?" once. `parentStarted`: completing a step also started its
 * parent (rule R-a2), and the screen says so.
 */
export async function completeTaskAction(
  _previous: FormState<{ askStartTime: boolean; parentStarted: boolean }>,
  formData: FormData,
): Promise<FormState<{ askStartTime: boolean; parentStarted: boolean }>> {
  const parsed = completeTaskSchema.safeParse({
    taskId: formData.get("taskId"),
    completeAllSteps: formData.get("completeAllSteps"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: completeRules(parsed.data.completeAllSteps),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await completeTask(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return {
    ok: true,
    message: result.data.parentStarted
      ? "Step done. The task was started with it."
      : "Marked done.",
    data: {
      askStartTime: result.data.askStartTime,
      parentStarted: result.data.parentStarted,
    },
  };
}

export async function reopenTaskAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = reopenTaskSchema.safeParse({
    taskId: formData.get("taskId"),
    to: formData.get("to"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: reopenRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await reopenTask(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: "Reopened." };
}

export async function backfillStartAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = backfillStartSchema.safeParse({
    taskId: formData.get("taskId"),
    startDate: formData.get("startDate"),
    startTime: formData.get("startTime"),
  });
  if (!parsed.success) return invalid(parsed.error);

  // The window (between creation and finish) needs the user's time zone, so the command checks it
  // on the locked row; this first check covers everything else.
  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: backfillStartRules(null),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await backfillStart(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: "Start time saved." };
}

export async function deleteTaskAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = taskActionSchema.safeParse({ taskId: formData.get("taskId") });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: deleteRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await deleteTask(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: authorization.record.parentTaskId ? "Step deleted." : "Task deleted." };
}

export async function restoreTaskAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = taskActionSchema.safeParse({ taskId: formData.get("taskId") });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEY,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: restoreRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await restoreTask(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidateTasks();
  return { ok: true, message: authorization.record.parentTaskId ? "Step restored." : "Task restored." };
}
