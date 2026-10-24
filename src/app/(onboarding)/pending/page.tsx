import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { gate } from "@/server/auth/access-gate";
import { getCurrentUser } from "@/server/auth/current-user";

// The one page a pending, rejected or deactivated account can see (besides sign-out).
export default async function PendingPage() {
  const user = await getCurrentUser();
  const decision = gate(user, "pending");
  if (!decision.allow) redirect(decision.redirectTo);
  if (!user) redirect("/sign-in");

  const content = {
    pending: {
      title: "Waiting for approval",
      body: "An administrator will review your account. You can sign in again later to check.",
    },
    rejected: {
      title: "Account not approved",
      body: user.rejectionReason
        ? `An administrator did not approve this account. Reason given: ${user.rejectionReason}`
        : "An administrator did not approve this account.",
    },
    deactivated: {
      title: "Account deactivated",
      body: "This account has been deactivated. Contact an administrator if you think this is a mistake.",
    },
    active: { title: "", body: "" },
  }[user.status];

  return (
    <AuthCard title={content.title} description={`Signed in as ${user.email}`}>
      <p className="text-sm">{content.body}</p>
      {user.status === "pending" && user.requestedRole ? (
        <p className="text-sm text-muted-foreground">You asked to join as: {user.requestedRole}.</p>
      ) : null}
      <SignOutButton />
    </AuthCard>
  );
}
