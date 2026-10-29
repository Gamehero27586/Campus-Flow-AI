import { formatDeadline } from "@/lib/time";
import { requirePermission } from "@/server/policies/authorize";
import { listMyDeletedTasks } from "@/server/tasks/queries";
import { BackLink } from "@/app/(app)/tasks/back-link";
import { RestoreButton } from "@/app/(app)/tasks/task-buttons";

export default async function DeletedTasksPage() {
  const { user } = await requirePermission("task.personal.manage");
  const deleted = await listMyDeletedTasks(user);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/tasks">Back to tasks</BackLink>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand">Deleted tasks</h1>
        <p className="text-sm text-muted-foreground">
          Deleted tasks are kept so you can bring them back. A task comes back with the steps that were
          deleted with it. A step you deleted on its own has its own row.
        </p>
      </div>

      {deleted.length === 0 ? (
        <p className="text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {deleted.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-semibold break-words">{task.title}</p>
                {task.parent ? (
                  <p className="text-sm text-muted-foreground">
                    Step of: {task.parent.title}
                    {task.parent.deleted ? " (also deleted)" : ""}
                  </p>
                ) : null}
                {task.stepsDeletedWithIt.length > 0 ? (
                  // These steps have no row of their own: they come back with the task.
                  <p className="text-sm text-muted-foreground">
                    Deleted with {task.stepsDeletedWithIt.length}{" "}
                    {task.stepsDeletedWithIt.length === 1 ? "step" : "steps"}:{" "}
                    {task.stepsDeletedWithIt.join(", ")}. {task.stepsDeletedWithIt.length === 1 ? "It comes" : "They come"}{" "}
                    back with the task.
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  Deleted {formatDeadline(task.deletedAt, user.timezone)}
                </p>
                {task.restoreBlocked ? (
                  <p className="text-sm font-medium text-foreground">{task.restoreBlocked}</p>
                ) : null}
              </div>
              {/* Disabled while the server would refuse it; the line above says why. */}
              <RestoreButton taskId={task.id} blockedReason={task.restoreBlocked} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
