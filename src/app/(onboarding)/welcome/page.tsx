import { redirect } from "next/navigation";
import { ADMIN_VISIBILITY_NOTICE, AuthCard } from "@/components/auth/auth-card";
import { WelcomeForm } from "@/app/(onboarding)/welcome/welcome-form";
import { gate } from "@/server/auth/access-gate";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function WelcomePage() {
  const user = await getCurrentUser();
  const decision = gate(user, "welcome");
  if (!decision.allow) redirect(decision.redirectTo);
  // A pending account that already chose a username has nothing left to do here.
  if (user?.username) redirect("/pending");

  return (
    <AuthCard
      title="Welcome"
      description={`Signed in as ${user?.email}. One last step before an administrator reviews your account.`}
    >
      <WelcomeForm />
      <p className="text-sm text-muted-foreground">{ADMIN_VISIBILITY_NOTICE}</p>
    </AuthCard>
  );
}
