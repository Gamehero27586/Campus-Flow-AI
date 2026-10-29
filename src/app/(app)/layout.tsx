import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requirePermission } from "@/server/policies/authorize";

// The layout redirects accounts that are not active yet and builds the menu. It is not the access
// check: every page and action under here checks again (CLAUDE.md security rule 2).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, permissions } = await requirePermission(null);

  // Settings is in the user menu at the bottom of the sidebar, not here.
  const navItems: NavItem[] = [
    ...(permissions.has("dashboard.view") ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(permissions.has("task.personal.manage") ? [{ href: "/tasks", label: "Tasks" }] : []),
    ...(permissions.has("admin.users.manage") ? [{ href: "/admin/users", label: "Users" }] : []),
    ...(permissions.has("admin.roles.edit_permissions")
      ? [{ href: "/admin/roles", label: "Roles" }]
      : []),
  ];

  return (
    <AppShell
      navItems={navItems}
      userName={user.displayUsername ?? user.name}
      userEmail={user.email}
      roleKey={user.roleKey}
    >
      {children}
    </AppShell>
  );
}
