"use client";

import { useActionState } from "react";
import { FieldError, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/result";
import {
  approveUserAction,
  reapproveUserAction,
  rejectUserAction,
  resetToPendingAction,
} from "@/app/(app)/admin/users/actions";

/** Approve a pending account, or reapprove one that was rejected by mistake (same fields, same checks). */
export function ApproveForm({
  userId,
  emailVerified,
  requestedRole,
  mode = "approve",
}: {
  userId: string;
  emailVerified: boolean;
  requestedRole: "student" | "faculty" | null;
  mode?: "approve" | "reapprove";
}) {
  const reapprove = mode === "reapprove";
  const [state, action, pending] = useActionState<FormState, FormData>(
    reapprove ? reapproveUserAction : approveUserAction,
    null,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        <label htmlFor={`role-${userId}`} className="text-sm font-medium">
          Role
        </label>
        <select
          id={`role-${userId}`}
          name="role"
          defaultValue={requestedRole ?? "student"}
          className="h-8 rounded-lg border border-input bg-card px-2 text-sm"
        >
          <option value="student">Student</option>
          <option value="faculty">Faculty</option>
        </select>
        <Button type="submit" size="sm" disabled={pending}>
          {pending
            ? reapprove
              ? "Reapproving..."
              : "Approving..."
            : reapprove
              ? "Reapprove"
              : "Approve"}
        </Button>
      </div>
      {!emailVerified ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="confirmedEmailOwner"
            className="mt-0.5 size-4 accent-primary"
            required
          />
          Have you confirmed this person owns this email? I have.
        </label>
      ) : null}
      {state && !state.ok ? <FormMessage>{state.error.message}</FormMessage> : null}
      {state?.ok ? <FormMessage tone="success">{state.message}</FormMessage> : null}
    </form>
  );
}

/** Takes a rejected account out of the rejected list and back into the approval queue. */
export function ResetToPendingForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetToPendingAction, null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Moving..." : "Move back to pending"}
      </Button>
      {state && !state.ok ? <FormMessage>{state.error.message}</FormMessage> : null}
    </form>
  );
}

export function RejectForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(rejectUserAction, null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        <Input
          name="reason"
          aria-label="Reason (optional, shown to the person)"
          placeholder="Reason (optional)"
          maxLength={500}
          className="h-8"
        />
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? "Rejecting..." : "Reject"}
        </Button>
      </div>
      <FieldError messages={state && !state.ok ? state.fieldErrors?.reason : undefined} />
      {state && !state.ok ? <FormMessage>{state.error.message}</FormMessage> : null}
    </form>
  );
}
