import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { env } from "@/env";
import { googleErrorMessage } from "@/lib/auth-messages";
import { gate } from "@/server/auth/access-gate";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const decision = gate(await getCurrentUser(), "public");
  if (!decision.allow) redirect(decision.redirectTo);

  // Better Auth sends the browser back here with ?error=<code> when a Google sign-in fails.
  const { error } = await searchParams;
  const googleError = googleErrorMessage(typeof error === "string" ? error : null);
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <AuthSplit title="Sign in" description="Welcome back.">
      <SignInForm googleEnabled={googleEnabled} googleError={googleError} />
    </AuthSplit>
  );
}
