import "server-only";
import type { OllamaClient } from "@/server/ai/client";

// A stand-in for the model, used only when AI_FAKE_MODEL=yes (src/env.ts allows that on the test database only).
// It always answers with the same four steps, so a browser test can click through the whole breakdown flow
// without Ollama or a graphics card. It never makes a network call.

export const FAKE_MODEL_NAME = "fake-model";

const FAKE_STEPS = {
  steps: [
    { title: "Review what the task asks for", minutes: 30 },
    { title: "Plan the main parts", minutes: 30 },
    { title: "Do the main work", minutes: 90 },
    { title: "Check the result and finish", minutes: 30 },
  ],
};

export function createFakeClient(): OllamaClient {
  return {
    model: FAKE_MODEL_NAME,
    async chatJson() {
      const text = JSON.stringify(FAKE_STEPS);
      return {
        text,
        json: FAKE_STEPS,
        parseError: null,
        latencyMs: 5,
        stats: { evalCount: null, promptEvalCount: null, totalMs: null },
      };
    },
    async warm() {},
    async unload() {},
    async health() {
      return { ok: true as const, version: "fake" };
    },
  };
}
