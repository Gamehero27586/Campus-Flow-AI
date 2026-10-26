import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { TASK_ESTIMATE_MAX_MINUTES, TASK_ESTIMATE_MIN_MINUTES } from "../../../config/limits";
import {
  deletedReasonEnum,
  estimateSourceEnum,
  taskCategoryEnum,
  taskContextEnum,
  taskEventTypeEnum,
  taskPriorityEnum,
  taskSourceEnum,
  taskStatusEnum,
} from "./enums";
import { users } from "./auth";

// Tasks and their history (docs/data-model.md §4). Only src/server/tasks/commands.ts writes these tables
// (the seed script is the one allowed exception).
//
// assignment_id, team_id and ai_suggestion_id are plain uuid columns on purpose: the tables they point to
// do not exist yet. Slices 4, 7 and 11 add the foreign keys in their own migrations.
// Rows are never hard-deleted (soft delete), so the self-reference restricts deletion.

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    context: taskContextEnum("context").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    assigneeId: uuid("assignee_id").references(() => users.id),
    assignmentId: uuid("assignment_id"),
    teamId: uuid("team_id"),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    description: text("description"),
    category: taskCategoryEnum("category").notNull(),
    categoryOther: text("category_other"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    status: taskStatusEnum("status").notNull().default("todo"),
    source: taskSourceEnum("source").notNull().default("manual"),
    aiSuggestionId: uuid("ai_suggestion_id"),
    deadline: timestamp("deadline", { withTimezone: true }),
    originalDeadline: timestamp("original_deadline", { withTimezone: true }),
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    estimateMinutes: integer("estimate_minutes"),
    estimateSource: estimateSourceEnum("estimate_source"),
    resubmissionUntil: timestamp("resubmission_until", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedReason: deletedReasonEnum("deleted_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // The three context shapes.
    check(
      "tasks_context_shape",
      sql`(
        (${table.context} = 'personal'
          AND ${table.assigneeId} IS NOT NULL
          AND ${table.assigneeId} = ${table.createdBy}
          AND ${table.assignmentId} IS NULL
          AND ${table.teamId} IS NULL)
        OR
        (${table.context} = 'assignment'
          AND ${table.assigneeId} IS NOT NULL
          AND ${table.assignmentId} IS NOT NULL
          AND ${table.teamId} IS NULL)
        OR
        (${table.context} = 'team'
          AND ${table.teamId} IS NOT NULL
          AND ${table.assignmentId} IS NULL)
      )`,
    ),
    check("tasks_done_has_completed_at", sql`(${table.status} = 'done') = (${table.completedAt} IS NOT NULL)`),
    check(
      "tasks_category_other_label",
      sql`(${table.category} = 'other') = (${table.categoryOther} IS NOT NULL)`,
    ),
    check(
      "tasks_deleted_pair",
      sql`(${table.deletedAt} IS NULL) = (${table.deletedReason} IS NULL)`,
    ),
    check(
      "tasks_started_before_completed",
      sql`${table.startedAt} IS NULL OR ${table.completedAt} IS NULL OR ${table.startedAt} <= ${table.completedAt}`,
    ),
    check("tasks_reschedule_count_not_negative", sql`${table.rescheduleCount} >= 0`),
    check(
      "tasks_estimate_in_range",
      sql`${table.estimateMinutes} IS NULL OR ${table.estimateMinutes} BETWEEN ${sql.raw(String(TASK_ESTIMATE_MIN_MINUTES))} AND ${sql.raw(String(TASK_ESTIMATE_MAX_MINUTES))}`,
    ),
    // Every timestamp comes from the app clock (now() in src/lib/time.ts): the commands set created_at and
    // updated_at themselves, so these CHECKs can only fail on a bug. The defaults are a fallback.
    check(
      "tasks_started_after_created",
      sql`${table.startedAt} IS NULL OR ${table.startedAt} >= ${table.createdAt}`,
    ),
    check(
      "tasks_completed_after_created",
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.createdAt}`,
    ),
    // An estimate and where it came from go together (the estimate-accuracy metric and the "AI guess" label).
    check(
      "tasks_estimate_has_source",
      sql`(${table.estimateMinutes} IS NULL) = (${table.estimateSource} IS NULL)`,
    ),
    check(
      "tasks_resubmission_only_assignment",
      sql`${table.resubmissionUntil} IS NULL OR ${table.context} = 'assignment'`,
    ),
    // original_deadline is set the first time a deadline is set; the rescheduling metric relies on it.
    check(
      "tasks_deadline_has_original",
      sql`${table.deadline} IS NULL OR ${table.originalDeadline} IS NOT NULL`,
    ),
    // Minimum only: maximum lengths stay in Zod so the limits in src/config/limits.ts can change without a migration.
    check("tasks_title_not_blank", sql`length(btrim(${table.title})) > 0`),
    check(
      "tasks_category_other_not_blank",
      sql`${table.categoryOther} IS NULL OR length(btrim(${table.categoryOther})) > 0`,
    ),
    // recipient_removed and assignment_cancelled belong to assignment tasks only.
    check(
      "tasks_personal_delete_reason",
      sql`${table.context} <> 'personal' OR ${table.deletedReason} IS NULL OR ${table.deletedReason} = 'user_deleted'`,
    ),
    check("tasks_not_its_own_parent", sql`${table.parentTaskId} IS NULL OR ${table.parentTaskId} <> ${table.id}`),
    // A student never gets the same assignment twice, but can still have subtasks of it.
    uniqueIndex("tasks_one_assignment_task_per_student")
      .on(table.assignmentId, table.assigneeId)
      .where(sql`${table.parentTaskId} IS NULL`),
    index("tasks_assignee_deadline_idx").on(table.assigneeId, table.deadline),
    index("tasks_parent_idx").on(table.parentTaskId),
    index("tasks_assignment_idx").on(table.assignmentId),
    index("tasks_team_idx").on(table.teamId),
  ],
);

// Append-only: the trigger from migration 0002 (reject_append_only_change) is attached in migration 0003.
export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    eventType: taskEventTypeEnum("event_type").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("task_events_task_created_idx").on(table.taskId, table.createdAt)],
);
