"use client";

import { useSyncExternalStore } from "react";
import { FieldError, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backfillStartAction } from "@/app/(app)/tasks/actions";
import { useActionForm } from "@/app/(app)/tasks/use-action-form";

// "When did you start?" (docs/data-flows.md §2): asked once, after a task that was never started is marked
// done. It lives in one place on the page, not inside the Done button, because marking the task done
// refreshes the list and the button may disappear (a Done task leaves the Open filter) before the person
// has answered. A tiny store says which task to ask about; <StartPromptHost /> shows the dialog.

type Prompt = { taskId: string; minDate: string; maxDate: string } | null;

let current: Prompt = null;
const listeners = new Set<() => void>();

function set(next: Prompt) {
  current = next;
  for (const listener of listeners) listener();
}

export function openStartPrompt(prompt: NonNullable<Prompt>) {
  set(prompt);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function StartPromptHost() {
  const prompt = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return (
    <Dialog open={prompt !== null} onOpenChange={(open) => !open && set(null)}>
      <DialogContent>{prompt ? <StartPromptForm key={prompt.taskId} prompt={prompt} /> : null}</DialogContent>
    </Dialog>
  );
}

function StartPromptForm({ prompt }: { prompt: NonNullable<Prompt> }) {
  const form = useActionForm(backfillStartAction, { onSuccess: () => set(null) });

  return (
    <form onSubmit={form.onSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>When did you start?</DialogTitle>
        <DialogDescription>
          Optional. This task was never started, so we do not know how long it took. Pick when you
          began, or skip.
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="taskId" value={prompt.taskId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Date</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            min={prompt.minDate}
            max={prompt.maxDate}
            required
          />
          <FieldError messages={form.fieldErrors?.startDate} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startTime">Time</Label>
          <Input id="startTime" name="startTime" type="time" required />
          <FieldError messages={form.fieldErrors?.startTime} />
        </div>
      </div>
      {form.error ? <FormMessage>{form.error}</FormMessage> : null}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={() => set(null)}>
          Skip
        </Button>
        <Button type="submit" disabled={form.pending}>
          {form.pending ? "Saving..." : "Save start time"}
        </Button>
      </DialogFooter>
    </form>
  );
}
