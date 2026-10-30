import { defineConfig } from "@playwright/test";

// End-to-end flows run against a PRODUCTION build (docs/decisions.md §12: Better Auth's rate limits
// only work in production mode) on port 3100, so they never clash with `npm run dev` on port 3000.
// They use the database in .env.local, which is the TEST database (docs/decisions.md §18).
//   npm run test:e2e        builds, starts the app on 3100, runs the flows
// The sign-in and sign-up rate limit is 5 per minute, so wait a minute between runs.

// The flows read E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD from .env.local (git-ignored).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the flows will say which variable is missing.
}

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // One flow at a time: they share one database and one rate limit.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `${BASE_URL}/sign-in`,
    // Better Auth only accepts requests from the address it is told about.
    // AI_FAKE_MODEL swaps Ollama for a fixed fake, so the AI flow does not depend on a graphics card.
    env: { BETTER_AUTH_URL: BASE_URL, AI_FAKE_MODEL: "yes" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
