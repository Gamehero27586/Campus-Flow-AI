"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, type FormState } from "@/lib/result";
import { welcomeSchema } from "@/lib/schemas/auth";
import { gate } from "@/server/auth/access-gate";
import { getCurrentUser } from "@/server/auth/current-user";
import { completeWelcome } from "@/server/users/commands";

export async function completeWelcomeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  // 1. Parse
  const parsed = welcomeSchema.safeParse({
    username: formData.get("username"),
    requestedRole: formData.get("requestedRole") ?? "",
  });
  if (!parsed.success) {
    return fail(
      "invalid_input",
      "Check the highlighted fields.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  // 2. Who is this, and may they be here? (Not authorize(): the account is pending by design.)
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const decision = gate(user, "welcome");
  if (!decision.allow) redirect(decision.redirectTo);

  // 3. One command
  const result = await completeWelcome(user, parsed.data, await headers());
  if (!result.ok) return result;

  // 4. Revalidate and move on
  revalidatePath("/", "layout");
  redirect("/pending");
}
