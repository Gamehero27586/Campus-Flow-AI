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
