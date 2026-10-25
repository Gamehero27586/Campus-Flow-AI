// The theme is a browser cookie (docs/decisions.md §17), so it also works on the sign-in page and
// needs no database column. "system" follows the operating system's light or dark setting.

export const THEME_COOKIE = "theme";
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** Anything that is not one of the three known values means "system". */
export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? "system";
}

/** Should the page use the dark colours? `systemIsDark` is the operating system's setting. */
export function isDark(theme: Theme, systemIsDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemIsDark);
}

/**
 * Runs in <head> before the page paints, so a "system" visitor on a dark computer never sees a
 * light flash. It only reads the cookie and toggles the `dark` class; it is a constant, not user input.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]+)/);var t=m?m[1]:"system";var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})();`;
