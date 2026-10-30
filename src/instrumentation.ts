// Runs once when the Next.js server starts (node_modules/next/dist/docs/.../instrumentation.md). It starts the
// model warm-up in the background. It does nothing during `next build`, in the Edge runtime or in tests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV === "test") return;

  const { warmUpInBackground } = await import("@/server/ai/warmup");
  warmUpInBackground();
}
