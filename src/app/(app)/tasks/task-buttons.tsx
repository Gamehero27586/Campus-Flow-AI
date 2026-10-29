"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  completeTaskAction,
  deleteTaskAction,
  moveBackToTodoAction,
  reopenTaskAction,
  restoreTaskAction,
  startTaskAction,
} from "@/app/(app)/tasks/actions";
import { openStartPrompt } from "@/app/(app)/tasks/start-prompt";
import { useActionButton } from "@/app/(app)/tasks/use-action-form";

// The one-click actions on a task. Each calls its server action and toasts the answer in words. The server
// decides everything (these buttons are a convenience): a refused click shows the reason.

type Size = "default" | "sm";

export function StartButton({ taskId, size = "default" }: { taskId: string; size?: Size }) {
  const { run, pending } = useActionButton(startTaskAction);
  return (
    <Button size={size} disabled={pending} onClick={() => run({ taskId })}>
      {pending ? "Starting..." : "Start"}
    </Button>
  );
}

/**
 * Mark done. A task with steps that are not done asks first ("Complete them too?"), and a task that was
 * never started asks once "When did you start?" afterwards.
 */
export function DoneButton({
  taskId,
  openSteps,
  minDate,
  maxDate,
  size = "default",
  variant = "default",
}: {
  taskId: string;
  openSteps: number;
  /** The first and last day the "When did you start?" field allows (local dates). */
  minDate: string;
  maxDate: string;
  size?: Size;
  variant?: "default" | "secondary";
}) {
  const { run, pending } = useActionButton(completeTaskAction);
  const [confirming, setConfirming] = useState(false);

  function complete(all: boolean) {
    run({ taskId, completeAllSteps: all ? "on" : "" }, (result) => {
      setConfirming(false);
      if (result.data?.askStartTime) openStartPrompt({ taskId, minDate, maxDate });
    });
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        disabled={pending}
        onClick={() => (openSteps > 0 ? setConfirming(true) : complete(false))}
      >
        {pending && !confirming ? "Saving..." : "Mark done"}
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {openSteps === 1 ? "1 step is not done" : `${openSteps} steps are not done`}
            </DialogTitle>
            <DialogDescription>
              Complete {openSteps === 1 ? "it" : "them"} too? They will all be marked done now.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => complete(true)}>
              {pending ? "Saving..." : "Complete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MoveBackButton({ taskId, size = "default" }: { taskId: string; size?: Size }) {
  const { run, pending } = useActionButton(moveBackToTodoAction);
  return (
    <Button size={size} variant="secondary" disabled={pending} onClick={() => run({ taskId })}>
      Move back to To Do
    </Button>
  );
}

/** Done back to In progress. A step of a Done parent is refused by the server ("Reopen the task first"). */
export function ReopenButton({ taskId, size = "default" }: { taskId: string; size?: Size }) {
  const { run, pending } = useActionButton(reopenTaskAction);
  return (
    <Button
      size={size}
      variant="secondary"
      disabled={pending}
      onClick={() => run({ taskId, to: "in_progress" })}
    >
      Reopen
    </Button>
  );
}

/**
 * Delete with a way back: the toast has an Undo button for about 8 seconds (it calls restoreTask), and the
 * task stays in the Deleted list for good. `onDeleted` lets the detail page leave the deleted task.
 */
export function DeleteButton({
  taskId,
  label = "Delete",
  noun = "Task",
  size = "default",
  onDeletedGoTo,
}: {
  taskId: string;
  label?: string;
  /** What is being deleted, for the toast: "Task" or "Step". */
  noun?: "Task" | "Step";
  size?: Size;
  /** Where to go after deleting (the detail page goes back to the list). */
  onDeletedGoTo?: string;
}) {
  const router = useRouter();
  const { run, pending } = useActionButton(deleteTaskAction);

  function onDelete() {
    run(
      { taskId },
      () => {
        toast(`${noun} deleted`, {
          duration: 8000,
          action: {
            label: "Undo",
            onClick: async () => {
              const formData = new FormData();
              formData.set("taskId", taskId);
              const result = await restoreTaskAction(null, formData);
              if (result?.ok) {
                toast.success(`${noun} restored.`);
                router.refresh();
              } else if (result) {
                toast.error(result.error.message);
              }
            },
          },
        });
        if (onDeletedGoTo) router.push(onDeletedGoTo);
      },
      { toastOnSuccess: false },
    );
  }

  return (
    <Button size={size} variant="destructive" disabled={pending} onClick={onDelete}>
      {pending ? "Deleting..." : label}
    </Button>
  );
}

/**
 * Restore. `blockedReason` (from the server's own rule, restoreBlock) disables the button: a step cannot come
 * back while its task is still deleted, and the screen says why next to it. The server refuses it anyway.
 */
export function RestoreButton({
  taskId,
  size = "default",
  blockedReason = null,
}: {
  taskId: string;
  size?: Size;
  blockedReason?: string | null;
}) {
  const { run, pending } = useActionButton(restoreTaskAction);
  return (
    <Button
      size={size}
      variant="secondary"
      disabled={pending || blockedReason !== null}
      title={blockedReason ?? undefined}
      onClick={() => run({ taskId })}
    >
      {pending ? "Restoring..." : "Restore"}
    </Button>
  );
}
