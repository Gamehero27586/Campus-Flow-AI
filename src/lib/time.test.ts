import { afterEach, describe, expect, it } from "vitest";
import { now, resetNowForTests, setNowForTests } from "@/lib/time";

describe("now()", () => {
  afterEach(() => resetNowForTests());

  it("returns the fixed instant when the clock is set", () => {
    setNowForTests(new Date("2026-11-02T09:30:00Z"));
    expect(now().toISOString()).toBe("2026-11-02T09:30:00.000Z");
  });

  it("returns a copy, so callers cannot move the fixed clock", () => {
    setNowForTests(new Date("2026-11-02T09:30:00Z"));
    now().setFullYear(1999);
    expect(now().toISOString()).toBe("2026-11-02T09:30:00.000Z");
  });

  it("follows the real clock after a reset", () => {
    setNowForTests(new Date("2000-01-01T00:00:00Z"));
    resetNowForTests();
    expect(now().getUTCFullYear()).toBeGreaterThanOrEqual(2026);
  });
});
