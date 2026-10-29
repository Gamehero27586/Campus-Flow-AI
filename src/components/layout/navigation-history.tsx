"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Did the person move between pages of this app since the page was loaded? The Back button on a page that
// is reached from a menu (Settings) uses the browser's history only if so: arriving on the page directly
// (a bookmark, a typed address, a refresh) leaves nothing in the app to go back to, and "back" there would
// leave the app. Module state lives as long as the page does and is reset by a full page load.

let inAppNavigations = 0;
let lastPath: string | null = null;

/** Mounted once in the app shell. Counts page changes made inside the app. */
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (lastPath !== null && lastPath !== pathname) inAppNavigations += 1;
    lastPath = pathname;
  }, [pathname]);
  return null;
}

export function hasInAppHistory() {
  return inAppNavigations > 0;
}
