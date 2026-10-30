import "server-only";
import type { OllamaClient } from "@/server/ai/client";
import { getOllamaClient } from "@/server/ai/runtime";

// Loads the model into memory when the server starts, so the first student's click does not wait for it
// (docs/data-flows.md §8.0). The first run on this laptop showed a cold start of about 4 seconds, and once
// 22 seconds. It never blocks start-up and never throws: if Ollama is off, one line is logged and the rest of
// the app works as usual.

type WarmClient = Pick<OllamaClient, "health" | "warm" | "model">;
type Log = (line: string) => void;

export async function warmUpModel(client: WarmClient, log: Log = console.log): Promise<"warm" | "offline" | "failed"> {
  const health = await client.health();
  if (!health.ok) {
    log(`[ai] Ollama is not running; "Break this down" will be switched off until it is. Start it with: ollama serve`);
    return "offline";
  }
  try {
    const started = Date.now();
    await client.warm();
    log(`[ai] ${client.model} is loaded (${((Date.now() - started) / 1000).toFixed(1)} s).`);
    return "warm";
  } catch (error) {
    log(`[ai] Could not load ${client.model}: ${error instanceof Error ? error.message : "unknown error"}`);
    return "failed";
  }
}

/** Starts the warm-up without waiting for it: Next.js must not be held up by the model. */
export function warmUpInBackground(): void {
  void (async () => {
    try {
      await warmUpModel(getOllamaClient());
    } catch (error) {
      console.log(`[ai] Warm-up skipped: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  })();
}
