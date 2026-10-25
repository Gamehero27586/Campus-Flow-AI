import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The cap, swirl and book as a small rounded tile. The tile is always dark teal and uses the dark
 * version of the mark, so it reads the same on the teal sidebar, on cards and in either theme.
 */
export function Emblem({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 rounded-lg bg-brand-chip", className)}
      style={{ width: size, height: size, padding: Math.round(size * 0.06) }}
    >
      {/* SVG: Next.js serves it as is (no resizing step), so it stays sharp at any size. */}
      <Image src="/brand/mark-dark.svg" alt="" width={size} height={size} unoptimized />
    </span>
  );
}
