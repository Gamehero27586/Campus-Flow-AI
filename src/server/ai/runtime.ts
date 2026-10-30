import "server-only";
import { env } from "@/env";
import { createOllamaClient, type OllamaClient } from "@/server/ai/client";
import { createFakeClient } from "@/server/ai/fake-client";

// The one model client of the running app, built from OLLAMA_URL and OLLAMA_MODEL (src/env.ts). Kept on
// globalThis so the dev server's hot reload does not build a second one. createOllamaClient() refuses any
// address that is not this computer. With AI_FAKE_MODEL=yes (test database only, see src/env.ts) it is the fixed
// fake instead, for the browser tests.

const globalForClient = globalThis as unknown as { __campusflowOllama?: OllamaClient };

export function getOllamaClient(): OllamaClient {
  globalForClient.__campusflowOllama ??=
    env.AI_FAKE_MODEL === "yes"
      ? createFakeClient()
      : createOllamaClient({ baseUrl: env.OLLAMA_URL, model: env.OLLAMA_MODEL });
  return globalForClient.__campusflowOllama;
}
