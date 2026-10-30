import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { AI_FEEDBACK_MAX_LENGTH } from "../../../config/limits";
import { users } from "./auth";
import { aiOutcomeEnum, aiSuggestionKindEnum, aiTimeframeEnum } from "./enums";
import { tasks } from "./tasks";

// What the local AI was asked and what came back (docs/data-model.md §8, docs/slices/slice-4-plan.md 4b).
// Tier 1: only the owner of a suggestion ever reads it; there is no Admin path. Only src/server/ai/commands.ts
// writes this table, and tasks/commands.ts links the steps it saves to their suggestion.
//
// Every timestamp is set from the app clock (now() in src/lib/time.ts) by the commands; the defaults are a fallback.
// The summary's unique index is decided in Slice 9, not here (data-model.md §8).

export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    // The task a breakdown is for. Tasks are soft-deleted, never removed, so the default restrict is right.
    taskId: uuid("task_id").references(() => tasks.id),
    kind: aiSuggestionKindEnum("kind").notNull(),
    timeframe: aiTimeframeEnum("timeframe"),
    // The first day of the week or month a summary covers: a calendar date, not an instant.
    timeframeStart: date("timeframe_start", { mode: "string" }),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    // Exactly what was sent (the task as data, the existing steps, today's date).
    inputSnapshot: jsonb("input_snapshot").notNull(),
    outputRaw: text("output_raw"),
    // false until the answer has passed validation; a pending row is inserted before the model runs.
    outputValid: boolean("output_valid").notNull().default(false),
    latencyMs: integer("latency_ms"),
    itemsSuggested: integer("items_suggested"),
    itemsKept: integer("items_kept"),
    outcome: aiOutcomeEnum("outcome").notNull().default("pending"),
    rating: smallint("rating"),
    feedbackText: text("feedback_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    // The two shapes: a summary has a timeframe and no task (it is about a week or month, never one task); a
    // breakdown has a task and no timeframe.
    check(
      "ai_suggestions_kind_shape",
      sql`(
        (${table.kind} = 'summary'
          AND ${table.timeframe} IS NOT NULL
          AND ${table.timeframeStart} IS NOT NULL
          AND ${table.taskId} IS NULL)
        OR
        (${table.kind} = 'breakdown'
          AND ${table.taskId} IS NOT NULL
          AND ${table.timeframe} IS NULL
          AND ${table.timeframeStart} IS NULL)
      )`,
    ),
    check("ai_suggestions_rating_range", sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`),
    // A suggestion is resolved exactly when it is no longer pending.
    check("ai_suggestions_resolved_pair", sql`(${table.outcome} = 'pending') = (${table.resolvedAt} IS NULL)`),
    check(
      "ai_suggestions_resolved_after_created",
      sql`${table.resolvedAt} IS NULL OR ${table.resolvedAt} >= ${table.createdAt}`,
    ),
    // A failed suggestion is, by definition, one whose answer was not valid (AI-f).
    check("ai_suggestions_failed_not_valid", sql`${table.outcome} <> 'failed' OR ${table.outputValid} = false`),
    // Only a valid answer can be saved (accepted or edited).
    check(
      "ai_suggestions_saved_is_valid",
      sql`${table.outcome} NOT IN ('accepted', 'edited') OR ${table.outputValid} = true`,
    ),
    // AI-g: items are kept only when steps were saved. AI-f: "accepted" means saved exactly as suggested, so
    // everything suggested was kept.
    check(
      "ai_suggestions_kept_only_when_saved",
      sql`${table.itemsKept} IS NULL OR ${table.outcome} IN ('accepted', 'edited')`,
    ),
    check(
      "ai_suggestions_accepted_kept_all",
      sql`${table.outcome} <> 'accepted' OR ${table.itemsKept} = ${table.itemsSuggested}`,
    ),
    // AI-h: the rating and the comment come after saving, never on a discarded, failed or pending suggestion.
    check(
      "ai_suggestions_feedback_after_saving",
      sql`(${table.rating} IS NULL AND ${table.feedbackText} IS NULL) OR ${table.outcome} IN ('accepted', 'edited')`,
    ),
    check("ai_suggestions_latency_not_negative", sql`${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0`),
    check(
      "ai_suggestions_items_not_negative",
      sql`(${table.itemsSuggested} IS NULL OR ${table.itemsSuggested} >= 0) AND (${table.itemsKept} IS NULL OR ${table.itemsKept} >= 0)`,
    ),
    check(
      "ai_suggestions_kept_within_suggested",
      sql`${table.itemsKept} IS NULL OR ${table.itemsSuggested} IS NULL OR ${table.itemsKept} <= ${table.itemsSuggested}`,
    ),
    // No empty comments (the same rule as task titles).
    check(
      "ai_suggestions_feedback_not_blank",
      sql`${table.feedbackText} IS NULL OR length(btrim(${table.feedbackText})) > 0`,
    ),
    check(
      "ai_suggestions_feedback_length",
      sql`${table.feedbackText} IS NULL OR length(${table.feedbackText}) <= ${sql.raw(String(AI_FEEDBACK_MAX_LENGTH))}`,
    ),
    index("ai_suggestions_user_kind_created_idx").on(table.userId, table.kind, table.createdAt),
    index("ai_suggestions_task_idx").on(table.taskId),
  ],
);
