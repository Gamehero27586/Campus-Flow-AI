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

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_PARENT = 20;
export const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const CLASS_CODE_DEFAULT_EXPIRY_DAYS = 7;

export const TREND_MIN_COMPLETED_WEEK = 5;
export const TREND_MIN_COMPLETED_MONTH = 10;
export const WEEKLY_SUMMARY_MIN_DUE_TASKS = 3;
export const CONSISTENCY_MIN_WEEKS = 2;
