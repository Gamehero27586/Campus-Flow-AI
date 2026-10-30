import { pgEnum } from "drizzle-orm/pg-core";
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from "../../../config/task-values";

export { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES };

// Enums are defined once here and reused by the Zod schemas (docs/folder-structure.md §4).

export const USER_STATUSES = ["pending", "active", "rejected", "deactivated"] as const;
export const userStatusEnum = pgEnum("user_status", USER_STATUSES);

export const REQUESTED_ROLES = ["student", "faculty"] as const;
export const requestedRoleEnum = pgEnum("requested_role", REQUESTED_ROLES);

// Tasks (docs/data-model.md §4).
export const TASK_CONTEXTS = ["personal", "assignment", "team"] as const;
export const taskContextEnum = pgEnum("task_context", TASK_CONTEXTS);

export const taskCategoryEnum = pgEnum("task_category", TASK_CATEGORIES);

export const taskPriorityEnum = pgEnum("task_priority", TASK_PRIORITIES);

export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);

export const TASK_SOURCES = ["manual", "ai_breakdown"] as const;
export const taskSourceEnum = pgEnum("task_source", TASK_SOURCES);

export const ESTIMATE_SOURCES = ["user", "history", "ai"] as const;
export const estimateSourceEnum = pgEnum("estimate_source", ESTIMATE_SOURCES);

export const DELETED_REASONS = ["user_deleted", "recipient_removed", "assignment_cancelled"] as const;
export const deletedReasonEnum = pgEnum("deleted_reason", DELETED_REASONS);

export const TASK_EVENT_TYPES = [
  "created",
  "status_changed",
  "deadline_changed",
  "reopened",
  "deleted",
  "restored",
  "resubmission_granted",
  "reassigned",
  "start_backfilled",
] as const;
export const taskEventTypeEnum = pgEnum("task_event_type", TASK_EVENT_TYPES);

// AI suggestions (docs/data-model.md §8).
export const AI_SUGGESTION_KINDS = ["breakdown", "summary"] as const;
export const aiSuggestionKindEnum = pgEnum("ai_suggestion_kind", AI_SUGGESTION_KINDS);

export const AI_TIMEFRAMES = ["week", "month"] as const;
export const aiTimeframeEnum = pgEnum("ai_timeframe", AI_TIMEFRAMES);

// pending: waiting for the student. accepted: saved exactly as suggested. edited: saved with any change.
// discarded: closed without saving. failed: invalid twice, timed out, or Ollama off (docs/slices/slice-4-plan.md AI-f).
export const AI_OUTCOMES = ["pending", "accepted", "edited", "discarded", "failed"] as const;
export const aiOutcomeEnum = pgEnum("ai_outcome", AI_OUTCOMES);
