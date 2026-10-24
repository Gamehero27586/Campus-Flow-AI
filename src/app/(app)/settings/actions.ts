"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { fail, type FormState } from "@/lib/result";
import { changePasswordSchema } from "@/lib/schemas/auth";
import { timezoneFormSchema } from "@/lib/schemas/settings";
import { authorize } from "@/server/policies/authorize";
import { changePassword, updateTimezone } from "@/server/users/commands";
import { hasPasswordLogin } from "@/server/users/queries";

export async function updateTimezoneAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = timezoneFormSchema.safeParse({ timezone: formData.get("timezone") });
  if (!parsed.success) {
    return fail(
      "invalid_input",
      "Choose a valid time zone.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  // Settings need no permission key, only an active account.
  const authorization = await authorize(null);
  if (!authorization.ok) return fail("not_allowed", "Please sign in again.");

  const result = await updateTimezone(authorization.user, parsed.data.timezone);
  if (!result.ok) return result;

  revalidatePath("/settings");
  return { ok: true, message: "Time zone saved." };
}

export async function changePasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return fail(
      "invalid_input",
      "Check the highlighted fields.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const authorization = await authorize(null);
  if (!authorization.ok) return fail("not_allowed", "Please sign in again.");
  if (!(await hasPasswordLogin(authorization.user))) {
    return fail("no_password", "This account signs in with Google and has no password to change.");
  }

  const result = await changePassword(parsed.data, await headers());
  if (!result.ok) return result;

  return { ok: true, message: "Password changed. Other devices were signed out." };
}
