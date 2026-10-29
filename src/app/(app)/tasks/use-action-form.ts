"use client";

import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/result";

type Action<TData> = (previous: null, formData: FormData) => Promise<FormState<TData>>;
type Success<TData> = Extract<NonNullable<FormState<TData>>, { ok: true }>;

/**
 * Runs a task server action from a form and keeps its answer for the field messages.
 *
 * It reads the form with an onSubmit handler rather than `<form action>`: React clears an uncontrolled
 * form after a form action even when the answer is an error, and a person who mistyped one field should
 * not lose the other five.
 */
export function useActionForm<TData = unknown>(
  action: Action<TData>,
  options: { onSuccess?: (result: Success<TData>) => void; toastOnSuccess?: boolean } = {},
) {
  const [state, setState] = useState<FormState<TData>>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action(null, formData);
      setState(result);
      if (result?.ok) {
        if (options.toastOnSuccess !== false && result.message) toast.success(result.message);
        options.onSuccess?.(result as Success<TData>);
      }
    });
  }

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const error = state && !state.ok ? state.error.message : null;
  return { onSubmit, pending, state, fieldErrors, error, reset: () => setState(null) };
}

/**
 * Runs a task server action from a button (no form fields beyond hidden values) and toasts the answer.
 * The message says what happened in words, including "The task was started with it" when starting or
 * completing a step also started its parent (rules R-a and R-a2).
 */
export function useActionButton<TData = unknown>(action: Action<TData>) {
  const [pending, startTransition] = useTransition();

  function run(
    fields: Record<string, string>,
    onSuccess?: (result: Success<TData>) => void,
    options: { toastOnSuccess?: boolean } = {},
  ) {
    const formData = new FormData();
    for (const [name, value] of Object.entries(fields)) formData.set(name, value);
    startTransition(async () => {
      const result = await action(null, formData);
      if (result === null) return;
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (options.toastOnSuccess !== false && result.message) toast.success(result.message);
      onSuccess?.(result as Success<TData>);
    });
  }

  return { run, pending };
}
