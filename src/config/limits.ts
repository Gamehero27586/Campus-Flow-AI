// Limits and thresholds live here and nowhere else (docs/decisions.md §2, §8).

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_PARENT = 20;
export const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const CLASS_CODE_DEFAULT_EXPIRY_DAYS = 7;

export const TREND_MIN_COMPLETED_WEEK = 5;
export const TREND_MIN_COMPLETED_MONTH = 10;
export const WEEKLY_SUMMARY_MIN_DUE_TASKS = 3;
export const CONSISTENCY_MIN_WEEKS = 2;
