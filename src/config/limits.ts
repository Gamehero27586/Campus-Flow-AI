// Limits and thresholds live here and nowhere else (docs/decisions.md §2, §8).

// Usernames: letters, numbers, dot, underscore; stored lower case; never changed (decisions.md §3).
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

// Names that would let someone pose as the institution, the app or a role (docs/reviews/slice-1-opus-review.md R5).
// Compared after lower-casing and removing dots and underscores, so "Ad.min" and "support_" are refused too.
export const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "root",
  "sysadmin",
  "superuser",
  "support",
  "help",
  "helpdesk",
  "security",
  "system",
  "staff",
  "official",
  "moderator",
  "mod",
  "owner",
  "faculty",
  "teacher",
  "teachers",
  "professor",
  "student",
  "students",
  "campusflow",
  "campusflowai",
  "everyone",
  "anonymous",
  "null",
  "undefined",
] as const;

export const NAME_MAX_LENGTH = 100;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Tasks (docs/slices/slice-3-plan.md R-i). The estimate limits are also written into a database CHECK
// (migration 0003); changing them later needs a new migration as well as a change here.
export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 5000;
export const TASK_CATEGORY_OTHER_MAX_LENGTH = 40;
export const TASK_ESTIMATE_MIN_MINUTES = 1;
export const TASK_ESTIMATE_MAX_MINUTES = 6000;
export const MAX_SUBTASKS_PER_TASK = 30;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_PARENT = 20;
export const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const CLASS_CODE_DEFAULT_EXPIRY_DAYS = 7;

export const TREND_MIN_COMPLETED_WEEK = 5;
export const TREND_MIN_COMPLETED_MONTH = 10;
export const WEEKLY_SUMMARY_MIN_DUE_TASKS = 3;
export const CONSISTENCY_MIN_WEEKS = 2;

// A deadline picked as a date only is due at this local time on that day (docs/slices/slice-3-plan.md §2).
export const DEFAULT_DEADLINE_TIME = "23:59";

// Deadlines and start times outside these years are refused as typing mistakes (for example 20266 or 0202).
export const TASK_DATE_MIN_YEAR = 2000;
export const TASK_DATE_MAX_YEAR = 2100;

// AI (docs/slices/slice-4-plan.md AI-c, AI-i; docs/data-flows.md §8.1). The model's answer is checked against
// these with Zod; nothing the model returns is trusted to respect them.
export const AI_STEPS_MIN = 3;
export const AI_STEPS_MAX = 10;
export const AI_STEP_TITLE_MIN_LENGTH = 3;
export const AI_STEP_TITLE_MAX_LENGTH = 120;
export const AI_STEP_MINUTES_MIN = 5;
export const AI_STEP_MINUTES_MAX = 600;
// The task description is cut to this many characters in the prompt (the context window is 4,096 tokens).
export const AI_DESCRIPTION_PROMPT_MAX_LENGTH = 1500;
export const AI_CALL_TIMEOUT_MS = 60_000;
export const AI_HEALTH_TIMEOUT_MS = 2_000;
export const AI_NUM_CTX = 4096;
export const AI_KEEP_ALIVE = "30m";
// The student's optional comment on a suggestion (AI-h). The database also checks this length (ai_suggestions).
export const AI_FEEDBACK_MAX_LENGTH = 500;
// The AI queue (AI-j, docs/data-flows.md §8.1 step 3): one job on the graphics card at a time, a short line
// behind it, one job per person, and a pause between one person's requests.
export const AI_QUEUE_MAX_WAITING = 3;
export const AI_USER_COOLDOWN_MS = 10_000;
// A job that has not finished by then gives its place back (two model attempts of AI_CALL_TIMEOUT_MS plus slack).
export const AI_JOB_MAX_MS = 2 * AI_CALL_TIMEOUT_MS + 5_000;
// "AI is offline" is checked at most this often, so a page load never waits for Ollama.
export const AI_HEALTH_CACHE_MS = 30_000;
// A suggestion still pending after this long counts as abandoned in the statistics (AI-f); the row is not changed.
export const AI_ABANDONED_AFTER_MS = 30 * 60_000;
