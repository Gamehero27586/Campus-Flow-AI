import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reads the real theme tokens from src/app/globals.css, so the check can never drift from the CSS.
// Text needs 4.5:1; controls (outlines, focus rings, chart lines) need 3:1 (WCAG 2.1 AA).

const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `block "${selector}" not found in globals.css`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const result: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    result[match[1]] = match[2];
  }
  return result;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["brand", "background"],
  ["brand", "card"],
  ["brand", "teal-soft"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["success", "background"],
  ["success", "card"],
  ["info", "background"],
  ["info", "card"],
  ["coral-strong", "background"],
  ["amber-strong", "amber-soft"],
  ["foreground", "amber-soft"],
  ["foreground", "teal-soft"],
];

const CONTROL_PAIRS: Array<[string, string]> = [
  ["input", "background"],
  ["input", "card"],
  ["ring", "background"],
  ["ring", "card"],
  ["sidebar-ring", "sidebar"],
  ["chart-1", "background"],
  ["chart-2", "background"],
  ["chart-3", "background"],
  ["disabled", "background"],
];

for (const theme of [":root", ".dark"]) {
  describe(`${theme === ":root" ? "light" : "dark"} theme contrast`, () => {
    const colours = tokens(theme);

    it("defines every token the checks use", () => {
      for (const name of new Set([...TEXT_PAIRS, ...CONTROL_PAIRS].flat())) {
        expect(colours[name], `--${name}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it.each(TEXT_PAIRS)("text: --%s on --%s is at least 4.5:1", (foreground, background) => {
      expect(contrast(colours[foreground], colours[background])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(CONTROL_PAIRS)("control: --%s on --%s is at least 3:1", (foreground, background) => {
      expect(contrast(colours[foreground], colours[background])).toBeGreaterThanOrEqual(3);
    });

    it("keeps cards visibly separate from the page (border or surface step)", () => {
      // Cards need a border or a soft shadow (color-palette.md §2); the border must differ from the page.
      expect(colours.border.toLowerCase()).not.toBe(colours.background.toLowerCase());
      expect(colours.card.toLowerCase()).not.toBe(colours.background.toLowerCase());
    });
  });
}

describe("dark theme uses the owner's palette", () => {
  const dark = tokens(".dark");

  it.each([
    ["background", "#121f1e"],
    ["sidebar", "#163b39"],
    ["primary", "#0d4f4c"],
    ["card", "#203331"],
    ["foreground", "#faf7f2"],
    ["muted-foreground", "#b7c7c2"],
    ["secondary", "#f0806a"],
    ["accent", "#f2b84b"],
    ["border", "#36514d"],
    ["disabled", "#71817c"],
  ])("--%s is %s", (name, hex) => {
    expect(dark[name].toLowerCase()).toBe(hex);
  });
});
