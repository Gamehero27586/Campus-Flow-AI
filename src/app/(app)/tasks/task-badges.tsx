import { CheckIcon, CircleDashedIcon, ClockIcon, LoaderIcon } from "lucide-react";
import {
  TASK_CATEGORY_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
} from "@/config/task-values";
import { cn } from "@/lib/utils";

// Task states (docs/color-palette.md §5). Every state has a word and an icon, never colour alone.

const base = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium";

export function StatusBadge({ status }: { status: TaskStatus }) {
  if (status === "done") {
    return (
      <span className={cn(base, "text-success")}>
        <CheckIcon className="size-3.5" aria-hidden="true" />
        {TASK_STATUS_LABELS.done}
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className={cn(base, "bg-teal-soft text-brand")}>
        <LoaderIcon className="size-3.5" aria-hidden="true" />
        {TASK_STATUS_LABELS.in_progress}
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-muted text-foreground")}>
      <CircleDashedIcon className="size-3.5" aria-hidden="true" />
      {TASK_STATUS_LABELS.todo}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className={cn(base, "text-destructive")}>
      <ClockIcon className="size-3.5" aria-hidden="true" />
      Overdue
    </span>
  );
}

export function PriorityText({ priority }: { priority: TaskPriority }) {
  return <span>{TASK_PRIORITY_LABELS[priority]} priority</span>;
}

export function categoryLabel(category: TaskCategory, other: string | null) {
  return category === "other" && other ? other : TASK_CATEGORY_LABELS[category];
}
