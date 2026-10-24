// Scripts run outside Next.js, so they load .env.local themselves. Import this file first.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the real environment.
}
