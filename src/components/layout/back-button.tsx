"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { hasInAppHistory } from "@/components/layout/navigation-history";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A visible Back button for pages reached from a menu (Settings), where nothing on the page leads out. It
 * does what the browser's back button does when the person came from another page of the app, so someone
 * used to "back" is not surprised; otherwise it goes to `fallbackHref`. It is a real link, so it also works
 * before the page's scripts have loaded. `cn()` is needed here for the same reason as in the task pages'
 * BackLink: without it the border is lost.
 */
export function BackButton({
  fallbackHref,
  children = "Back",
}: {
  fallbackHref: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={fallbackHref}
      className={cn(buttonVariants({ variant: "secondary" }))}
      onClick={(event) => {
        if (hasInAppHistory()) {
          event.preventDefault();
          router.back();
        }
      }}
    >
      <ArrowLeftIcon aria-hidden="true" />
      {children}
    </Link>
  );
}
