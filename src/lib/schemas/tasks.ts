import { z } from "zod";
import {
  MAX_SUBTASKS_PER_TASK,
  TASK_CATEGORY_OTHER_MAX_LENGTH,
  TASK_DATE_MAX_YEAR,
  TASK_DATE_MIN_YEAR,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_ESTIMATE_MIN_MINUTES,
  TASK_TITLE_MAX_LENGTH,
} from "@/config/limits";
import { TASK_CATEGORIES, TASK_PRIORITIES } from "@/config/task-values";
import { isValidLocalDate, isValidLocalTime } from "@/lib/time";

// What a task form may send (docs/slices/slice-3-plan.md 3c). The browser forms and the server actions
// both use these, so the limits (src/config/limits.ts) are checked in both places. Dates and times are
// the user's LOCAL date and time; the server turns them into UTC (src/server/tasks/time.ts).

/** A blank form field means "not given". */
const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === "string" && value.trim() === "") ? null : value;

export const taskIdSchema = z.uuid("That task was not recognised.");

const title = z
  .string("Enter a title.")
  .trim()
  .min(1, "Enter a title.")
  .max(TASK_TITLE_MAX_LENGTH, `Use at most ${TASK_TITLE_MAX_LENGTH} characters.`);

const description = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .max(TASK_DESCRIPTION_MAX_LENGTH, `Use at most ${TASK_DESCRIPTION_MAX_LENGTH} characters.`)
    .nullable(),
);

const category = z.enum(TASK_CATEGORIES, "Choose a category.");

const categoryOther = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .max(TASK_CATEGORY_OTHER_MAX_LENGTH, `Use at most ${TASK_CATEGORY_OTHER_MAX_LENGTH} characters.`)
    .nullable(),
);

const priority = z.preprocess(
  (value) => blankToNull(value) ?? "medium",
  z.enum(TASK_PRIORITIES, "Choose a priority."),
);

const estimateMinutes = z.preprocess(
  (value) => {
    const given = blankToNull(value);
    return typeof given === "string" ? Number(given) : given;
  },
  z
    .number("Enter a whole number of minutes.")
    .int("Enter a whole number of minutes.")
    .min(TASK_ESTIMATE_MIN_MINUTES, `Use at least ${TASK_ESTIMATE_MIN_MINUTES} minute.`)
    .max(TASK_ESTIMATE_MAX_MINUTES, `Use at most ${TASK_ESTIMATE_MAX_MINUTES} minutes.`)
    .nullable(),
);

// A year outside the range is almost always a typing mistake; refuse it here, with a field message,
// instead of letting it reach the database.
const localDate = z
  .string("Choose a date.")
  .trim()
  .refine(isValidLocalDate, { error: "Choose a valid date.", abort: true })
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= TASK_DATE_MIN_YEAR && year <= TASK_DATE_MAX_YEAR;
  }, `Choose a date between the years ${TASK_DATE_MIN_YEAR} and ${TASK_DATE_MAX_YEAR}.`);

const localTime = z.string("Choose a time.").trim().refine(isValidLocalTime, "Choose a valid time.");

const optionalDate = z.preprocess(blankToNull, localDate.nullable());
const optionalTime = z.preprocess(blankToNull, localTime.nullable());

/** A category of "Other" needs a label; any other category keeps none. */
function categoryRules<T extends { category: string; categoryOther: string | null }>(
  value: T,
  context: z.RefinementCtx,
) {
  if (value.category === "other" && !value.categoryOther) {
    context.addIssue({ code: "custom", path: ["categoryOther"], message: "Name the category." });
  }
}

function timeNeedsDate<T extends { deadlineDate: string | null; deadlineTime: string | null }>(
  value: T,
  context: z.RefinementCtx,
) {
  if (value.deadlineTime && !value.deadlineDate) {
    context.addIssue({
      code: "custom",
      path: ["deadlineDate"],
      message: "Choose a date for that time.",
    });
  }
}

/** Step titles typed with the new task: blanks are dropped. */
const stepTitles = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.map((step) => (typeof step === "string" ? step.trim() : step)).filter((step) => step !== "")
      : [],
  z.array(title).max(MAX_SUBTASKS_PER_TASK, `Use at most ${MAX_SUBTASKS_PER_TASK} steps.`),
);

export const createTaskSchema = z
  .object({
    title,
    description,
    category,
    categoryOther,
    priority,
    deadlineDate: optionalDate,
    deadlineTime: optionalTime,
    estimateMinutes,
    steps: stepTitles,
  })
  .superRefine(categoryRules)
  .superRefine(timeNeedsDate)
  .transform((value) => ({
    ...value,
    categoryOther: value.category === "other" ? value.categoryOther : null,
  }));
export type CreateTaskInput = z.output<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({ taskId: taskIdSchema, title, description, category, categoryOther, priority, estimateMinutes })
  .superRefine(categoryRules)
  .transform((value) => ({
    ...value,
    categoryOther: value.category === "other" ? value.categoryOther : null,
  }));
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;

export const createSubtaskSchema = z
  .object({
    taskId: taskIdSchema,
    title,
    deadlineDate: optionalDate,
    deadlineTime: optionalTime,
    estimateMinutes,
  })
  .superRefine(timeNeedsDate);
export type CreateSubtaskInput = z.output<typeof createSubtaskSchema>;

export const updateSubtaskSchema = z.object({ taskId: taskIdSchema, title, estimateMinutes });
export type UpdateSubtaskInput = z.output<typeof updateSubtaskSchema>;

/** A deadline can be moved but not removed: removing it would take a late task out of the metrics. */
export const changeDeadlineSchema = z.object({
  taskId: taskIdSchema,
  deadlineDate: localDate,
  deadlineTime: optionalTime,
});
export type ChangeDeadlineInput = z.output<typeof changeDeadlineSchema>;

export const taskActionSchema = z.object({ taskId: taskIdSchema });
export type TaskActionInput = z.output<typeof taskActionSchema>;

export const completeTaskSchema = z.object({
  taskId: taskIdSchema,
  completeAllSteps: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
});
export type CompleteTaskInput = z.output<typeof completeTaskSchema>;

export const REOPEN_TARGETS = ["in_progress", "todo"] as const;
export const reopenTaskSchema = z.object({
  taskId: taskIdSchema,
  to: z.preprocess((value) => blankToNull(value) ?? "in_progress", z.enum(REOPEN_TARGETS)),
});
export type ReopenTaskInput = z.output<typeof reopenTaskSchema>;

export const backfillStartSchema = z.object({
  taskId: taskIdSchema,
  startDate: localDate,
  startTime: localTime,
});
export type BackfillStartInput = z.output<typeof backfillStartSchema>;
