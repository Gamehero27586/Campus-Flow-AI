"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  isDark,
  parseTheme,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE_SECONDS,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", isDark(theme, systemIsDark));
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    const value = parseTheme(next);
    // The cookie is read by the server on the next page load and by the inline script in <head>.
    document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    setThemeState(value);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    // While on "system", follow the operating system if it changes (for example at sunset).
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
