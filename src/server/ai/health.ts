import "server-only";
import { AI_HEALTH_CACHE_MS } from "@/config/limits";
import { now } from "@/lib/time";
import type { HealthResult } from "@/server/ai/client";
import { getOllamaClient } from "@/server/ai/runtime";

// "Is the AI running?" for the task page (docs/data-flows.md §8.0). The answer is kept for 30 seconds, so a page
// load never waits for Ollama and a stopped Ollama is not asked about on every click. Two pages asked at the
// same moment share one check. The rest of the app works whatever the answer is.

export type AiHealth = { online: boolean };

type Check = () => Promise<HealthResult>;

export function createHealthChecker(options: { check: Check; cacheMs?: number; clock?: () => number }) {
  const cacheMs = options.cacheMs ?? AI_HEALTH_CACHE_MS;
  const clock = options.clock ?? (() => now().getTime());

  let cached: { online: boolean; at: number } | null = null;
  let inFlight: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    let online = false;
    try {
      online = (await options.check()).ok;
    } catch {
      online = false;
    }
    cached = { online, at: clock() };
    return online;
  }

  return {
    async get(): Promise<AiHealth> {
      if (cached && clock() - cached.at < cacheMs) return { online: cached.online };
      inFlight ??= refresh().finally(() => {
        inFlight = null;
      });
      return { online: await inFlight };
    },
    /** Forget the answer, for example after a request found Ollama off. */
    forget() {
      cached = null;
    },
  };
}

const globalForHealth = globalThis as unknown as { __campusflowAiHealth?: ReturnType<typeof createHealthChecker> };

export function getAiHealthChecker() {
  globalForHealth.__campusflowAiHealth ??= createHealthChecker({ check: () => getOllamaClient().health() });
  return globalForHealth.__campusflowAiHealth;
}

export const getAiHealth = (): Promise<AiHealth> => getAiHealthChecker().get();
