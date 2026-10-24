import { defineConfig } from "@playwright/test";

// The three end-to-end flows are added in later slices. Run against a production build
// (docs/decisions.md §12): npm run build, then npm run test:e2e.
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});
