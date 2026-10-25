"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { THEME_LABELS, THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS: Record<Theme, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

/** Light, Dark or System. Each choice has a word and an icon, so colour is never the only cue. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("flex gap-1 rounded-lg bg-muted p-1", className)}
    >
      {THEMES.map((option) => {
        const Icon = ICONS[option];
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option)}
            className={cn(
              // min-w-0 and nowrap: the three choices share the width and never push past the box.
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium",
              selected
                ? "bg-card text-card-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {THEME_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
