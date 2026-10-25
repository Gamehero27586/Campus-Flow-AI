import { requirePermission } from "@/server/policies/authorize";

export default async function DashboardPage() {
  const { user } = await requirePermission("dashboard.view");

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-brand">
        Hello, {user.displayUsername ?? user.name}
      </h1>
      <p className="text-muted-foreground">
        Your account is active. Tasks, classes and your Growth Tracker arrive in the next slices.
      </p>
    </div>
  );
}
