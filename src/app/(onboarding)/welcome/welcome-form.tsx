"use client";

import { useActionState } from "react";
import { FieldError, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@/config/limits";
import type { FormState } from "@/lib/result";
import { completeWelcomeAction } from "@/app/(onboarding)/welcome/actions";

export function WelcomeForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(completeWelcomeAction, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          minLength={USERNAME_MIN_LENGTH}
          maxLength={USERNAME_MAX_LENGTH}
          aria-describedby="username-help"
        />
        <p id="username-help" className="text-sm text-muted-foreground">
          {USERNAME_MIN_LENGTH} to {USERNAME_MAX_LENGTH} characters: letters, numbers, dots and
          underscores. You cannot change it later.
        </p>
        <FieldError messages={fieldErrors?.username} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">I am joining as (optional)</legend>
        <p className="text-sm text-muted-foreground">
          This is only a request. An administrator chooses your role when approving you.
        </p>
        {[
          { value: "", label: "No preference" },
          { value: "student", label: "Student" },
          { value: "faculty", label: "Faculty" },
        ].map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="requestedRole"
              value={option.value}
              defaultChecked={option.value === ""}
              className="size-4 accent-primary"
            />
            {option.label}
          </label>
        ))}
        <FieldError messages={fieldErrors?.requestedRole} />
      </fieldset>

      {state && !state.ok && !fieldErrors?.username ? (
        <FormMessage>{state.error.message}</FormMessage>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
