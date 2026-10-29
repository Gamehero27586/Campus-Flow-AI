import Link from "next/link";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/policies/authorize";
import { listMyTasks, type TaskListFilter } from "@/server/tasks/queries";
import { StartPromptHost } from "@/app/(app)/tasks/start-prompt";
import { TaskCard } from "@/app/(app)/tasks/task-card";
import { NewTaskButton } from "@/app/(app)/tasks/task-forms";

const FILTERS: Array<{ value: TaskListFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

function parseFilter(value: string | string[] | undefined): TaskListFilter {
  return FILTERS.find((filter) => filter.value === value)?.value ?? "open";
}

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  // Personal tasks are private: the key is the check, and the list is scoped to this user in the query.
  const { user } = await requirePermission("task.personal.manage");
  const filter = parseFilter((await searchParams).filter);
  const tasks = await listMyTasks(user, filter);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-brand">Tasks</h1>
        <NewTaskButton timeZone={user.timezone} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter tasks" className="flex flex-wrap gap-2">
          {FILTERS.map(({ value, label }) => (
            <Link
              key={value}
              href={`/tasks?filter=${value}`}
              aria-current={filter === value ? "page" : undefined}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium",
                filter === value ? "border-brand bg-teal-soft text-brand" : "bg-card hover:bg-muted",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link href="/tasks/deleted" className="text-sm font-medium text-brand underline-offset-4 hover:underline">
          Deleted tasks
        </Link>
      </div>

      {tasks.length === 0 ? (
        filter === "open" ? (
          <div className="rounded-lg border border-dashed bg-card p-8 text-center">
            <p className="text-lg font-semibold">Add your first task</p>
            <p className="mt-1 text-muted-foreground">
              Write down what you need to do, give it a deadline, and break it into small steps.
              Only you can see your personal tasks.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">Nothing here.</p>
        )
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} timeZone={user.timezone} />
          ))}
        </ul>
      )}

      <StartPromptHost />
    </div>
  );
}
