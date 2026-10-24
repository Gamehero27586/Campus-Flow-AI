import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Pooled Neon string (or the local Postgres string). Used by the app.
  DATABASE_URL: z.string().min(1),
  // Optional direct (non-pooled) string. If set, drizzle-kit uses it for migrations.
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  OLLAMA_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.2:3b"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Names only: never print the values, they may be secrets.
  const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid or missing environment variables: ${names}. See .env.example.`);
}

export const env = parsed.data;
