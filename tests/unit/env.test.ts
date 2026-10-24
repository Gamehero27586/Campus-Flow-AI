import { afterEach, describe, expect, it, vi } from "vitest";

describe("src/env.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects an empty Ollama setting instead of silently using the default", async () => {
    vi.stubEnv("OLLAMA_MODEL", "");
    vi.resetModules();
    await expect(import("@/env")).rejects.toThrow(/OLLAMA_MODEL/);
  });

  it("reports only variable names, never values, when validation fails", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const error = await import("@/env").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("DATABASE_URL");
  });

  it("loads with the test values from vitest.config.ts", async () => {
    vi.resetModules();
    const { env } = await import("@/env");
    expect(env.OLLAMA_MODEL).toBe("llama3.2:3b");
  });
});
