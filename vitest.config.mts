import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // "server-only" throws outside Next.js's server build; tests are server-side, so use an empty stub.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    env: {
      // A harmless value so src/env.ts validates. Tests never connect to this.
      DATABASE_URL: "postgres://test:test@127.0.0.1:5432/test",
    },
  },
});
