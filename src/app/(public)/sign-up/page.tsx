import { redirect } from "next/navigation";
import { ADMIN_VISIBILITY_NOTICE, AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { env } from "@/env";
import { gate } from "@/server/auth/access-gate";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function SignUpPage() {
  const decision = gate(await getCurrentUser(), "public");
  if (!decision.allow) redirect(decision.redirectTo);

  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <AuthCard
      title="Create your account"
      description="An administrator approves new accounts before you can use the app."
    >
      <SignUpForm googleEnabled={googleEnabled} />
      <p className="text-sm text-muted-foreground">{ADMIN_VISIBILITY_NOTICE}</p>
    </AuthCard>
  );
}
