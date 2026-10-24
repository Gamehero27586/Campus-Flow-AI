"use client";

import { useActionState } from "react";
import { FieldError, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/config/limits";
import type { FormState } from "@/lib/result";
import { changePasswordAction, updateTimezoneAction } from "@/app/(app)/settings/actions";

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  return state.ok ? (
    <FormMessage tone="success">{state.message}</FormMessage>
  ) : (
    <FormMessage>{state.error.message}</FormMessage>
  );
}

export function TimezoneForm({ current, zones }: { current: string; zones: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateTimezoneAction, null);

  return (
    <form action={action} className="max-w-md space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Time zone</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={current}
          className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          Days and weeks in your tracker follow this time zone. Times are stored in UTC.
        </p>
        <FieldError messages={state && !state.ok ? state.fieldErrors?.timezone : undefined} />
      </div>
      <Status state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save time zone"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="max-w-md space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <FieldError messages={fieldErrors?.currentPassword} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        <FieldError messages={fieldErrors?.newPassword} />
      </div>
      <Status state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Changing..." : "Change password"}
      </Button>
    </form>
  );
}
