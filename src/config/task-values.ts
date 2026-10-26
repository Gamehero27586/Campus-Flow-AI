// The fixed choices on a task. Defined here so browser forms (src/lib/schemas) and the database enums
// (src/server/db/schema/enums.ts) share one list; browser code may not import the database folder.

export const TASK_CATEGORIES = ["assignment", "study", "project", "reading", "other"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The words the screens use ("To Do", not "todo"). */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In progress",
  done: "Done",
};

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  assignment: "Assignment",
  study: "Study",
  project: "Project",
  reading: "Reading",
  other: "Other",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
