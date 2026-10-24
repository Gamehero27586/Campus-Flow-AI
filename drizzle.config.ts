import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so it does not load .env.local by itself.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (for example in CI): rely on the real environment.
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error("Set DATABASE_URL in .env.local before running drizzle-kit.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
