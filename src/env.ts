import "server-only";
import { z } from "zod";
import { isLocalAddress } from "@/lib/local-address";

// A line like GOOGLE_CLIENT_ID= in .env.local arrives as an empty string; treat it as "not set".
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Pooled Neon string (or the local Postgres string). Used by the app.
  DATABASE_URL: z.string().min(1),
  // Optional direct (non-pooled) string. If set, drizzle-kit uses it for migrations.
  DATABASE_URL_UNPOOLED: optionalString,
  // Better Auth. The secret signs and encrypts cookies and tokens: at least 32 characters.
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  // Google sign-in is switched on only when both values are set.
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  // "yes" marks the TEST database (docs/decisions.md §18). It enables the destructive dev scripts and,
  // below, makes the app refuse any address other than this computer.
  DEV_DB_RESET_ALLOWED: optionalString,
  OLLAMA_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.2:3b"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Names only: never print the values, they may be secrets.
  const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid or missing environment variables: ${names}. See .env.example.`);
}

// The test database has accounts that share one simple password. Serving it on a public address (a
// tunnel, a deployment) would expose an Admin with a known password, so it is refused at start-up.
if (parsed.data.DEV_DB_RESET_ALLOWED === "yes" && !isLocalAddress(parsed.data.BETTER_AUTH_URL)) {
  throw new Error(
    "This is the test database (shared test password). It can only be served on localhost. " +
      "Use the live database for any other address, and remove DEV_DB_RESET_ALLOWED from the environment.",
  );
}

export const env = parsed.data;
