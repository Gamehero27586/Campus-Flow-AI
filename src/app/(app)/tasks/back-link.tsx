import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Back to ..." as a bordered button with an arrow, so it is easy to find (a plain text link got lost on the
 * page, owner's feedback 29 Oct 2026). Words and an icon, never colour alone. `cn()` is needed: the Button
 * component merges its classes with it, and without the merge "border-transparent" (the base) beats
 * "border-brand" (the secondary variant) and the border disappears.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "secondary" }))}>
      <ArrowLeftIcon aria-hidden="true" />
      {children}
    </Link>
  );
}
