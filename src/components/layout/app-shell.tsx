import type { ReactNode } from "react";
import { NavLink } from "@/components/layout/nav-link";
import { SignOutButton } from "@/components/layout/sign-out-button";

export type NavItem = { href: string; label: string };

// The menu is a convenience: it only hides links the role has no key for. Every page checks again.
export function AppShell({
  navItems,
  userName,
  roleLabel,
  children,
}: {
  navItems: NavItem[];
  userName: string;
  roleLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 bg-sidebar p-4 text-sidebar-foreground md:w-60 md:shrink-0">
        <p className="text-lg font-semibold">Campus Flow AI</p>
        <nav aria-label="Main" className="flex flex-row flex-wrap gap-1 md:flex-col">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 text-sm">
          <p>
            <span className="font-medium">{userName}</span>
            <br />
            <span className="opacity-80">{roleLabel}</span>
          </p>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex justify-end border-b bg-card p-3">
          <SignOutButton />
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
