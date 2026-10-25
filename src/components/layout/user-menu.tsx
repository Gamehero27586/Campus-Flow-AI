"use client";

import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RoleBadge } from "@/components/layout/role-badge";
import { signOutAction } from "@/components/layout/sign-out-action";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-muted";

/**
 * The name and role at the bottom of the sidebar. Opens a small menu with the theme choice, a link to
 * Settings and Sign out. (A fuller settings panel can replace the link later.)
 */
export function UserMenu({
  name,
  email,
  roleKey,
}: {
  name: string;
  email: string;
  roleKey: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Account menu for ${name}`}
        className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-sidebar-accent"
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="w-full truncate text-sm font-medium">{name}</span>
          <RoleBadge roleKey={roleKey} />
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-80" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 gap-3 p-3">
        <div className="space-y-0.5">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <ThemeSwitch />
        <div className="flex flex-col gap-0.5 border-t pt-2">
          <Link href="/settings" onClick={() => setOpen(false)} className={MENU_ITEM}>
            <Settings aria-hidden className="size-4" />
            Settings
          </Link>
          <form action={signOutAction}>
            <button type="submit" className={MENU_ITEM}>
              <LogOut aria-hidden className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
