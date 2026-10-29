import { requirePermission } from "@/server/policies/authorize";
import { BackLink } from "@/app/(app)/tasks/back-link";
import { NewTaskPageForm } from "@/app/(app)/tasks/task-forms";

// The new-task form as a page: this is what a phone opens (a wide screen gets a pop-up on the list).
export default async function NewTaskPage() {
  const { user } = await requirePermission("task.personal.manage");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <BackLink href="/tasks">Back to tasks</BackLink>
      <h1 className="text-2xl font-semibold text-brand">New task</h1>
      <p className="text-sm text-muted-foreground">Only you can see your personal tasks.</p>
      <NewTaskPageForm timeZone={user.timezone} />
    </div>
  );
}
