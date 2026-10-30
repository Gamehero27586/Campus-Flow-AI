"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { LoaderCircleIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_SUBTASKS_PER_TASK,
  TASK_DATE_MAX_YEAR,
  TASK_DATE_MIN_YEAR,
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_ESTIMATE_MIN_MINUTES,
  TASK_TITLE_MAX_LENGTH,
} from "@/config/limits";
import {
  discardBreakdownAction,
  requestBreakdownAction,
  saveBreakdownAction,
  type BreakdownView,
} from "@/app/(app)/tasks/ai-actions";

// "Break this down" (docs/slices/slice-4-plan.md 4d): the coral button, the loading state and the review panel.
// Rating a saved breakdown is on the task page (breakdown-history.tsx), any time. Everything the AI wrote is shown as plain text and nothing is saved until the student
// presses "Save steps". The server decides everything: this panel only collects the student's edits.

const DATE_MIN = `${TASK_DATE_MIN_YEAR}-01-01`;
const DATE_MAX = `${TASK_DATE_MAX_YEAR}-12-31`;

export type Availability = { available: true } | { available: false; reason: string };

type Row = {
  key: number;
  title: string;
  minutes: string;
  date: string;
  time: string;
  /** Position in the AI's list, or null for a row the student added. */
  suggestedIndex: number | null;
};

type Phase =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "failed"; message: string }
  | { kind: "review"; suggestionId: string; rows: Row[] };

function rowsFrom(view: BreakdownView): Row[] {
  return view.steps.map((step, index) => ({
    key: index,
    title: step.title,
    minutes: String(step.minutes),
    date: step.deadlineDate,
    time: step.deadlineTime,
    suggestedIndex: index,
  }));
}

export function AiBreakdown({
  taskId,
  timeZone,
  stepCount,
  availability,
}: {
  taskId: string;
  timeZone: string;
  /** Steps the task has now; the panel can hold the rest of the 30-step limit. */
  stepCount: number;
  availability: Availability;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function ask() {
    setPhase({ kind: "asking" });
    startTransition(async () => {
      const formData = new FormData();
      formData.set("taskId", taskId);
      const result = await requestBreakdownAction(null, formData);
      if (!result?.ok || !result.data) {
        setPhase({ kind: "failed", message: result && !result.ok ? result.error.message : "Something went wrong." });
        return;
      }
      setPhase({ kind: "review", suggestionId: result.data.suggestionId, rows: rowsFrom(result.data) });
    });
  }

  const busy = pending || phase.kind === "asking";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ai"
          disabled={!availability.available || busy || phase.kind === "review"}
          onClick={ask}
        >
          <SparklesIcon aria-hidden="true" />
          Break this down
        </Button>
        {!availability.available ? (
          <p className="text-sm text-muted-foreground">{availability.reason}</p>
        ) : phase.kind === "idle" ? (
          <p className="text-sm text-muted-foreground">
            The AI suggests steps for you to check. Nothing is saved until you say so.
          </p>
        ) : null}
      </div>

      {phase.kind === "asking" ? (
        <p role="status" className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm">
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
          Breaking it down... usually under 10 seconds. If the AI is busy this can take longer.
        </p>
      ) : null}

      {phase.kind === "failed" ? (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-card p-4 text-sm">
          <p className="font-medium">{phase.message}</p>
          <Button size="sm" variant="secondary" onClick={() => setPhase({ kind: "idle" })}>
            Close
          </Button>
        </div>
      ) : null}

      {phase.kind === "review" ? (
        <ReviewPanel
          taskId={taskId}
          suggestionId={phase.suggestionId}
          initialRows={phase.rows}
          roomForRows={Math.max(0, MAX_SUBTASKS_PER_TASK - stepCount)}
          timeZone={timeZone}
          onSaved={() => {
            // The new steps and the breakdown (with its stars) appear on the page after the refresh.
            setPhase({ kind: "idle" });
            router.refresh();
          }}
          onDiscarded={() => setPhase({ kind: "idle" })}
          onClosed={() => setPhase({ kind: "idle" })}
        />
      ) : null}

    </div>
  );
}

// ---- The review panel -------------------------------------------------------------------------------

function ReviewPanel({
  taskId,
  suggestionId,
  initialRows,
  roomForRows,
  timeZone,
  onSaved,
  onDiscarded,
  onClosed,
}: {
  taskId: string;
  suggestionId: string;
  initialRows: Row[];
  roomForRows: number;
  timeZone: string;
  onSaved: () => void;
  onDiscarded: () => void;
  onClosed: () => void;
}) {
  const [rows, setRows] = useState(initialRows);
  const [nextKey, setNextKey] = useState(initialRows.length);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [discarding, startDiscarding] = useTransition();

  const update = (key: number, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  function addRow() {
    setRows((current) => [
      ...current,
      { key: nextKey, title: "", minutes: "", date: "", time: "", suggestedIndex: null },
    ]);
    setNextKey((key) => key + 1);
  }

  function save() {
    setError(null);
    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("suggestionId", suggestionId);
    for (const row of rows) {
      formData.append("title", row.title);
      formData.append("estimateMinutes", row.minutes);
      formData.append("deadlineDate", row.date);
      formData.append("deadlineTime", row.date ? row.time : "");
      formData.append("suggestedIndex", row.suggestedIndex === null ? "" : String(row.suggestedIndex));
    }
    startSaving(async () => {
      const result = await saveBreakdownAction(null, formData);
      if (!result) return;
      if (!result.ok) {
        // The suggestion may have been used in another tab, or the task changed: say so and let the person leave.
        setError(result.error.message);
        return;
      }
      if (result.message) toast.success(result.message);
      onSaved();
    });
  }

  function discard() {
    setError(null);
    const formData = new FormData();
    formData.set("suggestionId", suggestionId);
    startDiscarding(async () => {
      const result = await discardBreakdownAction(null, formData);
      if (!result) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (result.message) toast.success(result.message);
      onDiscarded();
    });
  }

  const working = saving || discarding;
  const atLimit = rows.length >= roomForRows;

  return (
    <section
      aria-labelledby="ai-review-heading"
      className="space-y-4 rounded-lg border border-secondary bg-card p-4"
    >
      <div className="space-y-1">
        <h3 id="ai-review-heading" className="font-medium">
          Suggested steps
        </h3>
        <p className="text-sm text-muted-foreground">
          Suggested by AI. Check them before saving. You can change a title, an estimate or a date, remove a step, or
          add your own. Dates are in your time zone ({timeZone}) and were worked out for you; change or clear any of
          them.
        </p>
      </div>

      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor={`ai-title-${row.key}`}>
                  Step {index + 1}
                  {row.suggestedIndex === null ? " (added by you)" : ""}
                </Label>
                <Input
                  id={`ai-title-${row.key}`}
                  value={row.title}
                  maxLength={TASK_TITLE_MAX_LENGTH}
                  onChange={(event) => update(row.key, { title: event.target.value })}
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove step ${index + 1}`}
                disabled={working}
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`ai-minutes-${row.key}`}>Minutes</Label>
                <Input
                  id={`ai-minutes-${row.key}`}
                  type="number"
                  inputMode="numeric"
                  min={TASK_ESTIMATE_MIN_MINUTES}
                  max={TASK_ESTIMATE_MAX_MINUTES}
                  step={1}
                  value={row.minutes}
                  onChange={(event) => update(row.key, { minutes: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`ai-date-${row.key}`}>Due date</Label>
                <Input
                  id={`ai-date-${row.key}`}
                  type="date"
                  min={DATE_MIN}
                  max={DATE_MAX}
                  value={row.date}
                  onChange={(event) => update(row.key, { date: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`ai-time-${row.key}`}>Time</Label>
                <Input
                  id={`ai-time-${row.key}`}
                  type="time"
                  value={row.time}
                  disabled={row.date === ""}
                  onChange={(event) => update(row.key, { time: event.target.value })}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No steps left. Add one, or discard this suggestion.
        </p>
      ) : null}

      <div>
        <Button type="button" variant="secondary" size="sm" disabled={working || atLimit} onClick={addRow}>
          <PlusIcon aria-hidden="true" />
          Add a step
        </Button>
        {atLimit ? (
          <p className="mt-1 text-sm text-muted-foreground">
            A task can have at most {MAX_SUBTASKS_PER_TASK} steps.
          </p>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="font-medium text-destructive">{error}</p>
          <Button size="sm" variant="secondary" onClick={onClosed}>
            Close
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={working || rows.length === 0}>
          {saving ? "Saving..." : "Save steps"}
        </Button>
        <Button variant="secondary" onClick={discard} disabled={working}>
          {discarding ? "Discarding..." : "Discard"}
        </Button>
      </div>
    </section>
  );
}
