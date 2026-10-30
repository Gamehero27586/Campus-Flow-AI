import { describe, expect, it } from "vitest";
import type { HealthResult } from "@/server/ai/client";
import { createHealthChecker } from "@/server/ai/health";
import { warmUpModel } from "@/server/ai/warmup";

// The health answer is cached for 30 seconds and shared; the warm-up never throws and logs one line.

function checker(results: Array<HealthResult | Error>) {
  let time = 0;
  let calls = 0;
  const instance = createHealthChecker({
    cacheMs: 30_000,
    clock: () => time,
    check: async () => {
      const next = results[Math.min(calls, results.length - 1)];
      calls += 1;
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { instance, advance: (ms: number) => (time += ms), calls: () => calls };
}

describe("the health check", () => {
  it("says online when Ollama answers, offline when it does not", async () => {
    expect(await checker([{ ok: true, version: "0.40" }]).instance.get()).toEqual({ online: true });
    expect(await checker([{ ok: false }]).instance.get()).toEqual({ online: false });
  });

  it("a check that throws counts as offline and never reaches the page", async () => {
    expect(await checker([new Error("boom")]).instance.get()).toEqual({ online: false });
  });

  it("keeps the answer for 30 seconds, then asks again", async () => {
    const { instance, advance, calls } = checker([{ ok: false }, { ok: true, version: "0.40" }]);
    expect(await instance.get()).toEqual({ online: false });
    advance(29_000);
    expect(await instance.get()).toEqual({ online: false });
    expect(calls()).toBe(1);
    advance(1_000);
    expect(await instance.get()).toEqual({ online: true });
    expect(calls()).toBe(2);
  });

  it("two pages asking at the same moment share one check", async () => {
    const { instance, calls } = checker([{ ok: true, version: "0.40" }]);
    const [a, b, c] = await Promise.all([instance.get(), instance.get(), instance.get()]);
    expect([a, b, c]).toEqual([{ online: true }, { online: true }, { online: true }]);
    expect(calls()).toBe(1);
  });

  it("forget() makes the next page ask again", async () => {
    const { instance, calls } = checker([{ ok: true, version: "0.40" }, { ok: false }]);
    expect(await instance.get()).toEqual({ online: true });
    instance.forget();
    expect(await instance.get()).toEqual({ online: false });
    expect(calls()).toBe(2);
  });
});

describe("the warm-up", () => {
  const model = "llama3.2:3b";

  it("loads the model when Ollama is running and logs one line", async () => {
    const lines: string[] = [];
    let warmed = 0;
    const result = await warmUpModel(
      { model, health: async () => ({ ok: true, version: "0.40" }), warm: async () => void (warmed += 1) },
      (line) => lines.push(line),
    );
    expect(result).toBe("warm");
    expect(warmed).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(model);
  });

  it("when Ollama is off it logs one line, loads nothing and does not throw", async () => {
    const lines: string[] = [];
    let warmed = 0;
    const result = await warmUpModel(
      { model, health: async () => ({ ok: false }), warm: async () => void (warmed += 1) },
      (line) => lines.push(line),
    );
    expect(result).toBe("offline");
    expect(warmed).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("not running");
  });

  it("when loading fails it logs one line and does not throw", async () => {
    const lines: string[] = [];
    const result = await warmUpModel(
      {
        model,
        health: async () => ({ ok: true, version: "0.40" }),
        warm: async () => {
          throw new Error("The model is not installed");
        },
      },
      (line) => lines.push(line),
    );
    expect(result).toBe("failed");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("not installed");
  });
});
