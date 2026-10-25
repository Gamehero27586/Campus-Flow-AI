import type { ReactNode } from "react";
import { Emblem } from "@/components/brand/emblem";
import { NavLink } from "@/components/layout/nav-link";
import { UserMenu } from "@/components/layout/user-menu";

export type NavItem = { href: string; label: string };

// The menu is a convenience: it only hides links the role has no key for. Every page checks again.
// Sign out, Settings and the theme live in the user menu at the bottom of the sidebar.
export function AppShell({
  navItems,
  userName,
  userEmail,
  roleKey,
  children,
}: {
  navItems: NavItem[];
  userName: string;
  userEmail: string;
  roleKey: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 bg-sidebar p-4 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-72 md:shrink-0">
        <div className="flex items-center gap-2.5">
          <Emblem size={36} />
          <p className="text-lg font-semibold">Campus Flow AI</p>
        </div>
        <nav aria-label="Main" className="flex flex-row flex-wrap gap-1 md:flex-col">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border pt-3">
          <UserMenu name={userName} email={userEmail} roleKey={roleKey} />
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
