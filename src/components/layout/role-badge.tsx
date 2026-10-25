import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<string, { label: string; className: string }> = {
  // Admin is amber so it stands out (color-palette.md: amber is for things that need attention).
  admin: { label: "Admin", className: "bg-accent text-accent-foreground" },
  faculty: { label: "Faculty", className: "bg-teal-soft text-brand" },
  // The thin border keeps the badge visible where its muted fill is close to the surface behind it (dark mode).
  student: { label: "Student", className: "border-border bg-muted text-foreground" },
};

/** The role in words inside a badge; the colour only adds emphasis, it is never the only cue. */
export function RoleBadge({ roleKey, className }: { roleKey: string | null; className?: string }) {
  const style = roleKey ? ROLE_STYLES[roleKey] : undefined;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        style?.className ?? "border-border bg-card text-muted-foreground",
        className,
      )}
    >
      {style?.label ?? "No role"}
    </Badge>
  );
}
