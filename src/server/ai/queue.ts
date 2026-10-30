import "server-only";
import {
  AI_JOB_MAX_MS,
  AI_QUEUE_MAX_WAITING,
  AI_USER_COOLDOWN_MS,
} from "@/config/limits";

// The single in-process queue for the model (CLAUDE.md "AI rules", rule AI-j). It assumes ONE Node process
// on one computer with one graphics card: the app runs on the owner's laptop, so a plain in-memory queue is
// enough. A second server process would have its own queue and the guarantees below would no longer hold.
//
// - One job runs at a time.
// - At most `maxWaiting` jobs wait behind it (3); a fourth person is told it is busy.
// - One job per person at a time, running or waiting.
// - A pause between one person's requests, counted from when their previous job FINISHED.
// - A job that does not finish within `jobMaxMs` gives its place back; its late result is ignored.
// - A job that throws gives its place back and the error is passed on.

export type QueueRejection = "busy" | "you_are_waiting" | "too_soon";

export type QueueOutcome<TValue> =
  | { ok: true; value: TValue; waitedBehind: number }
  | { ok: false; reason: QueueRejection; retryAfterMs?: number }
  | { ok: false; reason: "timeout" };

export type AiQueueOptions = {
  maxWaiting?: number;
  cooldownMs?: number;
  jobMaxMs?: number;
  /** Milliseconds since some fixed point; replaceable so tests control the pause. */
  clock?: () => number;
};

type Waiting = { userId: string; start: () => void };

export function createAiQueue(options: AiQueueOptions = {}) {
  const maxWaiting = options.maxWaiting ?? AI_QUEUE_MAX_WAITING;
  const cooldownMs = options.cooldownMs ?? AI_USER_COOLDOWN_MS;
  const jobMaxMs = options.jobMaxMs ?? AI_JOB_MAX_MS;
  const clock = options.clock ?? Date.now;

  let running: string | null = null; // the user whose job is on the model
  const waiting: Waiting[] = [];
  const busyUsers = new Set<string>(); // running or waiting
  const finishedAt = new Map<string, number>();

  /** Hands the model to the next person in line in the same step it is freed, so nobody can slip in between. */
  function startNext() {
    const next = waiting.shift();
    running = next ? next.userId : null;
    if (next) next.start();
  }

  /** Runs `job` when its turn comes, or says at once why it cannot be queued. */
  async function run<TValue>(userId: string, job: () => Promise<TValue>): Promise<QueueOutcome<TValue>> {
    if (busyUsers.has(userId)) return { ok: false, reason: "you_are_waiting" };

    const finished = finishedAt.get(userId);
    if (finished !== undefined) {
      const retryAfterMs = finished + cooldownMs - clock();
      if (retryAfterMs > 0) return { ok: false, reason: "too_soon", retryAfterMs };
    }

    if (running !== null && waiting.length >= maxWaiting) return { ok: false, reason: "busy" };

    busyUsers.add(userId);
    const waitedBehind = running === null ? 0 : waiting.length + 1;

    // Take the model now if it is free, otherwise wait: startNext() marks us as running when our turn comes.
    if (running === null) {
      running = userId;
    } else {
      await new Promise<void>((resolve) => waiting.push({ userId, start: resolve }));
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), jobMaxMs);
      });
      const result = await Promise.race([job(), timedOut]);
      if (result === "timeout") return { ok: false, reason: "timeout" };
      return { ok: true, value: result as TValue, waitedBehind };
    } finally {
      if (timer) clearTimeout(timer);
      finishedAt.set(userId, clock());
      busyUsers.delete(userId);
      startNext();
    }
  }

  return {
    run,
    /** How many jobs are waiting and whether one is running (for tests and the status line). */
    snapshot: () => ({ running: running !== null, waiting: waiting.length }),
  };
}

export type AiQueue = ReturnType<typeof createAiQueue>;

// One queue per Node process. Kept on globalThis so the dev server's hot reload does not create a second one.
const globalForQueue = globalThis as unknown as { __campusflowAiQueue?: AiQueue };

export function getAiQueue(): AiQueue {
  globalForQueue.__campusflowAiQueue ??= createAiQueue();
  return globalForQueue.__campusflowAiQueue;
}
