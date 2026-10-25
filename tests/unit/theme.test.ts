import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { isDark, parseTheme, THEME_COOKIE, THEME_INIT_SCRIPT, THEMES } from "@/lib/theme";

describe("parseTheme()", () => {
  it.each(THEMES)("keeps the known value %s", (theme) => {
    expect(parseTheme(theme)).toBe(theme);
  });

  it.each([undefined, null, "", "DARK", "blue", "dark; path=/", "<script>"])(
    "turns %j into system",
    (value) => {
      expect(parseTheme(value)).toBe("system");
    },
  );
});

describe("isDark()", () => {
  it("dark is always dark and light is always light", () => {
    expect(isDark("dark", false)).toBe(true);
    expect(isDark("dark", true)).toBe(true);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("light", false)).toBe(false);
  });

  it("system follows the operating system", () => {
    expect(isDark("system", true)).toBe(true);
    expect(isDark("system", false)).toBe(false);
  });
});

// Runs the real inline script (the one that runs in <head> before the page paints) against a fake page.
function runInitScript(cookie: string, systemIsDark: boolean): boolean {
  let hasDarkClass = false;
  const context = {
    document: {
      cookie,
      documentElement: {
        classList: {
          toggle: (_name: string, force: boolean) => {
            hasDarkClass = force;
          },
        },
      },
    },
    window: { matchMedia: () => ({ matches: systemIsDark }) },
  };
  vm.runInNewContext(THEME_INIT_SCRIPT, context);
  return hasDarkClass;
}

describe("the pre-paint theme script", () => {
  it("uses the dark class for the dark cookie, whatever the computer prefers", () => {
    expect(runInitScript(`${THEME_COOKIE}=dark`, false)).toBe(true);
  });

  it("uses no dark class for the light cookie, even on a dark computer", () => {
    expect(runInitScript(`${THEME_COOKIE}=light`, true)).toBe(false);
  });

  it("follows the computer for the system cookie and when there is no cookie", () => {
    expect(runInitScript(`${THEME_COOKIE}=system`, true)).toBe(true);
    expect(runInitScript(`${THEME_COOKIE}=system`, false)).toBe(false);
    expect(runInitScript("", true)).toBe(true);
    expect(runInitScript("", false)).toBe(false);
  });

  it("finds the cookie among others and ignores a cookie with a similar name", () => {
    expect(runInitScript(`a=1; ${THEME_COOKIE}=dark; b=2`, false)).toBe(true);
    expect(runInitScript(`not${THEME_COOKIE}=dark`, false)).toBe(false);
  });

  it("treats an unknown value like system", () => {
    expect(runInitScript(`${THEME_COOKIE}=purple`, true)).toBe(true);
    expect(runInitScript(`${THEME_COOKIE}=purple`, false)).toBe(false);
  });
});
