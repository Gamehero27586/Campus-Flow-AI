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

// The test database has accounts that share one simple password, so it may only be served on this
// computer (review T2). DEV_DB_RESET_ALLOWED=yes is the marker of the test database.
describe("src/env.ts refuses to serve the test database on a public address", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadWith(url: string, marker: string | undefined) {
    vi.stubEnv("BETTER_AUTH_URL", url);
    vi.stubEnv("DEV_DB_RESET_ALLOWED", marker ?? "");
    vi.resetModules();
    return import("@/env");
  }

  it.each([
    "https://demo.trycloudflare.com",
    "https://campus.example.com",
    "http://192.168.1.20:3000",
    "http://localhost.evil.com",
    "http://my-localhost:3000",
  ])("refuses %s when the marker is on", async (url) => {
    await expect(loadWith(url, "yes")).rejects.toThrow(
      /test database \(shared test password\)\. It can only be served on localhost/,
    );
  });

  it.each(["http://localhost:3000", "http://localhost:3100", "http://127.0.0.1:3000"])(
    "allows %s when the marker is on",
    async (url) => {
      const { env } = await loadWith(url, "yes");
      expect(env.BETTER_AUTH_URL).toBe(url);
    },
  );

  it("does not apply to the live database (marker off, empty or anything but 'yes')", async () => {
    for (const marker of [undefined, "no", "true", "YES"]) {
      const { env } = await loadWith("https://campus.example.com", marker);
      expect(env.BETTER_AUTH_URL).toBe("https://campus.example.com");
      vi.resetModules();
    }
  });

  it("explains how to proceed without printing any secret", async () => {
    const error = await loadWith("https://campus.example.com", "yes").catch((e: Error) => e);
    expect((error as Error).message).toMatch(/live database/);
    expect((error as Error).message).not.toMatch(/postgres|password=|secret/i);
  });
});

// AI_FAKE_MODEL replaces the model with a fixed fake for the browser tests. It must never be possible in a
// real deployment, so it is refused unless the TEST database marker is on.
describe("src/env.ts: AI_FAKE_MODEL is a test-database-only switch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadWith(fake: string, marker: string) {
    vi.stubEnv("AI_FAKE_MODEL", fake);
    vi.stubEnv("DEV_DB_RESET_ALLOWED", marker);
    vi.resetModules();
    return import("@/env");
  }

  it("is refused without the test database marker", async () => {
    await expect(loadWith("yes", "")).rejects.toThrow(/AI_FAKE_MODEL can only be used with the test database/);
  });

  it("is refused with any value other than yes", async () => {
    await expect(loadWith("true", "yes")).rejects.toThrow(/AI_FAKE_MODEL must be "yes"/);
  });

  it("is allowed with the test database marker", async () => {
    const { env } = await loadWith("yes", "yes");
    expect(env.AI_FAKE_MODEL).toBe("yes");
  });

  it("is off by default", async () => {
    vi.resetModules();
    const { env } = await import("@/env");
    expect(env.AI_FAKE_MODEL).toBeUndefined();
  });
});
