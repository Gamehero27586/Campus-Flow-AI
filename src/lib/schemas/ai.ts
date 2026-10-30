import { z } from "zod";
import { AI_FEEDBACK_MAX_LENGTH, AI_STEPS_MAX, MAX_SUBTASKS_PER_TASK } from "@/config/limits";
import { taskFieldSchemas, taskIdSchema } from "@/lib/schemas/tasks";

// What the AI breakdown forms may send (docs/slices/slice-4-plan.md 4c and 4d). The student's edited list
// follows the NORMAL step limits (title 1 to 200, estimate 1 to 6,000), not the model's: the model's limits
// (AI-c) are checked on the model's answer only. Dates and times are the user's local date and time.

const { title, estimateMinutes, optionalDate, optionalTime, timeNeedsDate, blankToNull } = taskFieldSchemas;

export const suggestionIdSchema = z.uuid("That suggestion was not recognised.");

/** Break a task down, or any action that only names a task. */
export const requestBreakdownSchema = z.object({ taskId: taskIdSchema });
export type RequestBreakdownInput = z.output<typeof requestBreakdownSchema>;

/** Discard a suggestion. */
export const discardBreakdownSchema = z.object({ suggestionId: suggestionIdSchema });
export type DiscardBreakdownInput = z.output<typeof discardBreakdownSchema>;

/**
 * One row of the review panel. `suggestedIndex` is the row's position in the list the AI suggested (0 for the
 * first), or empty for a row the student added. The server compares the row with the stored suggestion at that
 * position to decide "accepted" or "edited" and which estimates are still the AI's; it trusts nothing else.
 */
export const breakdownItemSchema = z
  .object({
    title,
    estimateMinutes,
    deadlineDate: optionalDate,
    deadlineTime: optionalTime,
    suggestedIndex: z.preprocess(
      (value) => {
        const given = blankToNull(value);
        return typeof given === "string" ? Number(given) : given;
      },
      z.number().int().min(0).max(AI_STEPS_MAX - 1).nullable(),
    ),
  })
  .superRefine(timeNeedsDate);
export type BreakdownItemInput = z.output<typeof breakdownItemSchema>;

export const saveBreakdownSchema = z
  .object({
    taskId: taskIdSchema,
    suggestionId: suggestionIdSchema,
    items: z
      .array(breakdownItemSchema)
      .min(1, "Keep at least one step, or discard the suggestion.")
      .max(MAX_SUBTASKS_PER_TASK, `Use at most ${MAX_SUBTASKS_PER_TASK} steps.`),
  })
  .superRefine((value, context) => {
    const indexes = value.items.flatMap((item) => (item.suggestedIndex === null ? [] : [item.suggestedIndex]));
    if (new Set(indexes).size !== indexes.length) {
      context.addIssue({ code: "custom", path: ["items"], message: "A suggested step appears twice." });
    }
  });
export type SaveBreakdownInput = z.output<typeof saveBreakdownSchema>;

const rating = z.preprocess(
  (value) => {
    const given = blankToNull(value);
    return typeof given === "string" ? Number(given) : given;
  },
  z.number("Choose 1 to 5 stars.").int().min(1, "Choose 1 to 5 stars.").max(5, "Choose 1 to 5 stars.").nullable(),
);

const feedback = z.preprocess(
  blankToNull,
  z.string().trim().max(AI_FEEDBACK_MAX_LENGTH, `Use at most ${AI_FEEDBACK_MAX_LENGTH} characters.`).nullable(),
);

/** The optional stars and comment after saving (AI-h). At least one of them. */
export const rateBreakdownSchema = z
  .object({ suggestionId: suggestionIdSchema, rating, feedback })
  .refine((value) => value.rating !== null || value.feedback !== null, {
    path: ["rating"],
    message: "Choose a rating or write a comment.",
  });
export type RateBreakdownInput = z.output<typeof rateBreakdownSchema>;
