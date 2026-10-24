// Expected failures (validation, not allowed, not found) return { ok: false, error }.
// Unexpected failures throw (docs/folder-structure.md §4).

export type ActionError = { code: string; message: string };

export type Failure = {
  ok: false;
  error: ActionError;
  fieldErrors?: Record<string, string[]>;
};

export function ok(): { ok: true };
export function ok<T>(data: T): { ok: true; data: T };
export function ok<T>(data?: T) {
  return data === undefined ? { ok: true as const } : { ok: true as const, data };
}

export function fail(
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>,
): Failure {
  return { ok: false, error: { code, message }, ...(fieldErrors ? { fieldErrors } : {}) };
}

/** What a form keeps between submissions of a server action (null before the first submit). */
export type FormState = { ok: true; message?: string } | Failure | null;
