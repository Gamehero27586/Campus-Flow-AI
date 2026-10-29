"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { FieldError, FormMessage } from "@/components/auth/auth-card";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_SUBTASKS_PER_TASK,
  TASK_CATEGORY_OTHER_MAX_LENGTH,
  TASK_DATE_MAX_YEAR,
  TASK_DATE_MIN_YEAR,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_ESTIMATE_MIN_MINUTES,
  TASK_TITLE_MAX_LENGTH,
} from "@/config/limits";
import {
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskCategory,
  type TaskPriority,
} from "@/config/task-values";
import {
  changeDeadlineAction,
  createSubtaskAction,
  createTaskAction,
  updateSubtaskAction,
  updateTaskAction,
} from "@/app/(app)/tasks/actions";
import { useActionForm } from "@/app/(app)/tasks/use-action-form";

// The task forms. Each shows the server's field messages under the field and a general message under
// the form; the server checks everything again (these limits only save a round trip).

const selectClass = "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm";
const DATE_MIN = `${TASK_DATE_MIN_YEAR}-01-01`;
const DATE_MAX = `${TASK_DATE_MAX_YEAR}-12-31`;

type Errors = Record<string, string[]> | undefined;

function Field({
  label,
  htmlFor,
  errors,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  errors?: string[];
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      <FieldError messages={errors} />
    </div>
  );
}

export type TaskDefaults = {
  title: string;
  description: string | null;
  category: TaskCategory;
  categoryOther: string | null;
  priority: TaskPriority;
  estimateMinutes: number | null;
};

const NEW_TASK_DEFAULTS: TaskDefaults = {
  title: "",
  description: null,
  category: "study",
  categoryOther: null,
  priority: "medium",
  estimateMinutes: null,
};

/** Title, description, category (with its label for Other), priority and estimate: shared by new and edit. */
function TaskFields({ defaults, errors, idPrefix }: { defaults: TaskDefaults; errors: Errors; idPrefix: string }) {
  const [category, setCategory] = useState<TaskCategory>(defaults.category);
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <>
      <Field label="Title" htmlFor={id("title")} errors={errors?.title}>
        <Input
          id={id("title")}
          name="title"
          defaultValue={defaults.title}
          maxLength={TASK_TITLE_MAX_LENGTH}
          required
          autoFocus
        />
      </Field>
      <Field label="Description (optional)" htmlFor={id("description")} errors={errors?.description}>
        <Textarea
          id={id("description")}
          name="description"
          defaultValue={defaults.description ?? ""}
          maxLength={TASK_DESCRIPTION_MAX_LENGTH}
          rows={3}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor={id("category")} errors={errors?.category}>
          <select
            id={id("category")}
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value as TaskCategory)}
            className={selectClass}
          >
            {TASK_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {TASK_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" htmlFor={id("priority")} errors={errors?.priority}>
          <select id={id("priority")} name="priority" defaultValue={defaults.priority} className={selectClass}>
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {TASK_PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {category === "other" ? (
        <Field label="Name the category" htmlFor={id("categoryOther")} errors={errors?.categoryOther}>
          <Input
            id={id("categoryOther")}
            name="categoryOther"
            defaultValue={defaults.categoryOther ?? ""}
            maxLength={TASK_CATEGORY_OTHER_MAX_LENGTH}
            required
          />
        </Field>
      ) : null}
      <Field
        label="Estimate in minutes (optional)"
        htmlFor={id("estimateMinutes")}
        errors={errors?.estimateMinutes}
      >
        <Input
          id={id("estimateMinutes")}
          name="estimateMinutes"
          type="number"
          inputMode="numeric"
          min={TASK_ESTIMATE_MIN_MINUTES}
          max={TASK_ESTIMATE_MAX_MINUTES}
          step={1}
          defaultValue={defaults.estimateMinutes ?? ""}
        />
      </Field>
    </>
  );
}

function DeadlineFields({
  errors,
  idPrefix,
  timeZone,
  required = false,
  defaultDate = "",
  defaultTime = "",
  onDateChange,
}: {
  errors: Errors;
  idPrefix: string;
  timeZone: string;
  required?: boolean;
  defaultDate?: string;
  defaultTime?: string;
  onDateChange?: (date: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={required ? "Deadline date" : "Deadline date (optional)"}
          htmlFor={`${idPrefix}-deadlineDate`}
          errors={errors?.deadlineDate}
        >
          <Input
            id={`${idPrefix}-deadlineDate`}
            name="deadlineDate"
            type="date"
            min={DATE_MIN}
            max={DATE_MAX}
            defaultValue={defaultDate}
            required={required}
            onChange={(event) => onDateChange?.(event.target.value)}
          />
        </Field>
        <Field
          label="Time (optional)"
          htmlFor={`${idPrefix}-deadlineTime`}
          errors={errors?.deadlineTime}
        >
          <Input
            id={`${idPrefix}-deadlineTime`}
            name="deadlineTime"
            type="time"
            defaultValue={defaultTime}
          />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">
        In your time zone ({timeZone}). With no time, the deadline is 23:59 on that day.
      </p>
    </div>
  );
}

// ---- New task ----------------------------------------------------------------------------------

export function TaskForm({
  timeZone,
  onDone,
}: {
  timeZone: string;
  /** Called with the new task's id after it is created. */
  onDone: (taskId: string | undefined) => void;
}) {
  const form = useActionForm(createTaskAction, {
    onSuccess: (result) => onDone(result.data?.taskId),
  });
  const [stepKeys, setStepKeys] = useState<number[]>([]);
  const nextKey = useRef(0);

  function addStep() {
    setStepKeys((keys) => [...keys, nextKey.current++]);
  }

  return (
    <form onSubmit={form.onSubmit} className="flex flex-col gap-4">
      <TaskFields defaults={NEW_TASK_DEFAULTS} errors={form.fieldErrors} idPrefix="new-task" />
      <DeadlineFields errors={form.fieldErrors} idPrefix="new-task" timeZone={timeZone} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Steps (optional)</legend>
        <p className="text-sm text-muted-foreground">
          Break the task into small steps. You can add more later.
        </p>
        {stepKeys.map((key, index) => (
          <div key={key} className="flex items-center gap-2">
            <Input
              name="steps"
              aria-label={`Step ${index + 1}`}
              placeholder={`Step ${index + 1}`}
              maxLength={TASK_TITLE_MAX_LENGTH}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={`Remove step ${index + 1}`}
              onClick={() => setStepKeys((keys) => keys.filter((k) => k !== key))}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        ))}
        <FieldError messages={form.fieldErrors?.steps} />
        {stepKeys.length < MAX_SUBTASKS_PER_TASK ? (
          <Button type="button" variant="secondary" size="sm" onClick={addStep}>
            <PlusIcon aria-hidden="true" /> Add a step
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">At most {MAX_SUBTASKS_PER_TASK} steps.</p>
        )}
      </fieldset>

      {form.error ? <FormMessage>{form.error}</FormMessage> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? "Creating..." : "Create task"}
        </Button>
      </div>
    </form>
  );
}

/**
 * "New task": a pop-up on a laptop, its own page (/tasks/new) on a phone. The link works without
 * JavaScript; on a wide screen the click is intercepted to open the pop-up instead.
 */
export function NewTaskButton({ timeZone }: { timeZone: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Link
        href="/tasks/new"
        className={buttonVariants({ size: "lg" })}
        onClick={(event) => {
          if (window.matchMedia("(min-width: 768px)").matches) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <PlusIcon aria-hidden="true" /> New task
      </Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>Only you can see your personal tasks.</DialogDescription>
          </DialogHeader>
          <TaskForm timeZone={timeZone} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The new-task form as a page (phones, and anyone who opens /tasks/new directly). */
export function NewTaskPageForm({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  return <TaskForm timeZone={timeZone} onDone={() => router.push("/tasks")} />;
}

// ---- Edit a task -------------------------------------------------------------------------------

export function EditTaskDialog({ taskId, defaults }: { taskId: string; defaults: TaskDefaults }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
            <DialogDescription>
              Changing the category or priority changes it for the steps too.
            </DialogDescription>
          </DialogHeader>
          <EditTaskForm taskId={taskId} defaults={defaults} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditTaskForm({
  taskId,
  defaults,
  onDone,
}: {
  taskId: string;
  defaults: TaskDefaults;
  onDone: () => void;
}) {
  const form = useActionForm(updateTaskAction, { onSuccess: onDone });
  return (
    <form onSubmit={form.onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="taskId" value={taskId} />
      <TaskFields defaults={defaults} errors={form.fieldErrors} idPrefix="edit-task" />
      {form.error ? <FormMessage>{form.error}</FormMessage> : null}
      <DialogFooter>
        <Button type="submit" disabled={form.pending}>
          {form.pending ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---- Change the deadline -----------------------------------------------------------------------

export function ChangeDeadlineDialog({
  taskId,
  timeZone,
  currentDate,
  currentTime,
  label = "Change deadline",
}: {
  taskId: string;
  timeZone: string;
  /** The current deadline as a local date and time, or empty when there is none yet. */
  currentDate: string;
  currentTime: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentDate ? "Change deadline" : "Set a deadline"}</DialogTitle>
            <DialogDescription>
              A deadline can be moved, not removed. Moving it later is counted as a reschedule.
            </DialogDescription>
          </DialogHeader>
          <DeadlineForm
            taskId={taskId}
            timeZone={timeZone}
            currentDate={currentDate}
            currentTime={currentTime}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeadlineForm({
  taskId,
  timeZone,
  currentDate,
  currentTime,
  onDone,
}: {
  taskId: string;
  timeZone: string;
  currentDate: string;
  currentTime: string;
  onDone: () => void;
}) {
  const form = useActionForm(changeDeadlineAction, { onSuccess: onDone });
  return (
    <form onSubmit={form.onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="taskId" value={taskId} />
      <DeadlineFields
        errors={form.fieldErrors}
        idPrefix="change-deadline"
        timeZone={timeZone}
        required
        defaultDate={currentDate}
        defaultTime={currentTime}
      />
      {form.error ? <FormMessage>{form.error}</FormMessage> : null}
      <DialogFooter>
        <Button type="submit" disabled={form.pending}>
          {form.pending ? "Saving..." : "Save deadline"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---- Steps -------------------------------------------------------------------------------------

/** Adds a step. A step deadline after the task's deadline is allowed but warned about (rule R-e). */
export function AddStepForm({
  parentId,
  parentDeadlineDate,
  timeZone,
}: {
  parentId: string;
  /** The task's own deadline as a local date, or null. */
  parentDeadlineDate: string | null;
  timeZone: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [stepDate, setStepDate] = useState("");
  const form = useActionForm(createSubtaskAction, {
    onSuccess: () => {
      formRef.current?.reset();
      setStepDate("");
    },
  });
  const afterParent = parentDeadlineDate !== null && stepDate !== "" && stepDate > parentDeadlineDate;

  return (
    <form ref={formRef} onSubmit={form.onSubmit} className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="font-medium">Add a step</h3>
      <input type="hidden" name="taskId" value={parentId} />
      <Field label="Step" htmlFor="add-step-title" errors={form.fieldErrors?.title}>
        <Input id="add-step-title" name="title" maxLength={TASK_TITLE_MAX_LENGTH} required />
      </Field>
      <DeadlineFields
        errors={form.fieldErrors}
        idPrefix="add-step"
        timeZone={timeZone}
        onDateChange={setStepDate}
      />
      {afterParent ? (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-amber-strong">
          <TriangleAlertIcon className="size-4" aria-hidden="true" />
          This is after the task&apos;s deadline. You can still add it.
        </p>
      ) : null}
      <Field
        label="Estimate in minutes (optional)"
        htmlFor="add-step-estimate"
        errors={form.fieldErrors?.estimateMinutes}
      >
        <Input
          id="add-step-estimate"
          name="estimateMinutes"
          type="number"
          inputMode="numeric"
          min={TASK_ESTIMATE_MIN_MINUTES}
          max={TASK_ESTIMATE_MAX_MINUTES}
          step={1}
        />
      </Field>
      {form.error ? <FormMessage>{form.error}</FormMessage> : null}
      <Button type="submit" disabled={form.pending}>
        {form.pending ? "Adding..." : "Add step"}
      </Button>
    </form>
  );
}

export function EditStepDialog({
  taskId,
  title,
  estimateMinutes,
  size = "sm",
}: {
  taskId: string;
  title: string;
  estimateMinutes: number | null;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit step</DialogTitle>
          </DialogHeader>
          <EditStepForm
            taskId={taskId}
            title={title}
            estimateMinutes={estimateMinutes}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditStepForm({
  taskId,
  title,
  estimateMinutes,
  onDone,
}: {
  taskId: string;
  title: string;
  estimateMinutes: number | null;
  onDone: () => void;
}) {
  const form = useActionForm(updateSubtaskAction, { onSuccess: onDone });
  return (
    <form onSubmit={form.onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="taskId" value={taskId} />
      <Field label="Step" htmlFor="edit-step-title" errors={form.fieldErrors?.title}>
        <Input
          id="edit-step-title"
          name="title"
          defaultValue={title}
          maxLength={TASK_TITLE_MAX_LENGTH}
          required
          autoFocus
        />
      </Field>
      <Field
        label="Estimate in minutes (optional)"
        htmlFor="edit-step-estimate"
        errors={form.fieldErrors?.estimateMinutes}
      >
        <Input
          id="edit-step-estimate"
          name="estimateMinutes"
          type="number"
          inputMode="numeric"
          min={TASK_ESTIMATE_MIN_MINUTES}
          max={TASK_ESTIMATE_MAX_MINUTES}
          step={1}
          defaultValue={estimateMinutes ?? ""}
        />
      </Field>
      {form.error ? <FormMessage>{form.error}</FormMessage> : null}
      <DialogFooter>
        <Button type="submit" disabled={form.pending}>
          {form.pending ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
