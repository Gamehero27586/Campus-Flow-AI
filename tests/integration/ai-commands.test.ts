import { and, asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SUBTASKS_PER_TASK } from "@/config/limits";
import type { BreakdownItemInput } from "@/lib/schemas/ai";
import { resetNowForTests, setNowForTests, toLocalDateTime } from "@/lib/time";
import { discardBreakdown, rateBreakdown, requestBreakdown, type BreakdownDeps } from "@/server/ai/commands";
import { OllamaError, type ChatJsonRequest, type ChatJsonResponse } from "@/server/ai/client";
import { createAiQueue } from "@/server/ai/queue";
import type { CurrentUser } from "@/server/auth/current-user";
import { aiSuggestions, taskEvents, tasks } from "@/server/db/schema";
import {
  completeTask,
  createStepsFromBreakdown,
  createSubtask,
  createTask,
  deleteTask,
} from "@/server/tasks/commands";
import { asCurrentUser, insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// The AI commands against an in-memory Postgres with the real migrations, a fake model and a fixed clock:
// requesting a breakdown (docs/data-flows.md §8.1), the date rules (AI-d), saving the steps (accepted or
// edited, items_kept: AI-f and AI-g), discarding and rating (AI-h). No Ollama is involved.

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/server/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

let db: TestDb;
let close: () => Promise<void>;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  holder.db = test.db;
  close = () => test.client.close();
});

afterAll(async () => {
  await close();
});

// 10:00 on Monday 2 November 2026 in India (UTC+5:30).
const T0 = new Date("2026-11-02T04:30:00Z");
beforeEach(() => setNowForTests(T0));
afterEach(() => resetNowForTests());

async function newStudent(): Promise<CurrentUser> {
  const row = await insertUser(db, { status: "active", timezone: "Asia/Kolkata" });
  return asCurrentUser(row, "student");
}

// ---- A fake model ------------------------------------------------------------------------------------

type Script = Array<ChatJsonResponse | OllamaError | (() => Promise<ChatJsonResponse>)>;

const FOUR_STEPS = {
  steps: [
    { title: "Review the notes", minutes: 60 },
    { title: "Draw the graph", minutes: 60 },
    { title: "Write the analysis", minutes: 120 },
    { title: "Check and submit", minutes: 60 },
  ],
};

const reply = (value: unknown, latencyMs = 1234): ChatJsonResponse => ({
  text: typeof value === "string" ? value : JSON.stringify(value),
  json: typeof value === "string" ? undefined : value,
  parseError: typeof value === "string" ? "Not JSON" : null,
  latencyMs,
  stats: { evalCount: 1, promptEvalCount: 1, totalMs: latencyMs },
});

function deps(script: Script, queue = createAiQueue({ clock: () => 0 })) {
  const requests: ChatJsonRequest[] = [];
  const dependencies: BreakdownDeps = {
    queue,
    client: {
      model: "llama3.2:3b",
      async chatJson(request) {
        requests.push(request);
        const next = script[requests.length - 1] ?? script[script.length - 1];
        if (next instanceof OllamaError) throw next;
        return typeof next === "function" ? next() : next;
      },
    },
  };
  return { dependencies, requests };
}

async function newTask(user: CurrentUser, overrides: Partial<Parameters<typeof createTask>[1]> = {}) {
  const result = await createTask(user, {
    title: "Physics lab report",
    description: "Write up the pendulum experiment.",
    category: "study",
    categoryOther: null,
    priority: "high",
    deadlineDate: "2026-11-06",
    deadlineTime: null,
    estimateMinutes: null,
    steps: [],
    ...overrides,
  });
  if (!result.ok) throw new Error(`could not create the task: ${result.error.message}`);
  return result.data.taskId;
}

const suggestionRows = (taskId: string) =>
  db.select().from(aiSuggestions).where(eq(aiSuggestions.taskId, taskId)).orderBy(asc(aiSuggestions.createdAt));

/** Asks the fake model once and returns the suggestion (the test fails if the request does not succeed). */
async function suggest(user: CurrentUser, taskId: string, answer: unknown = FOUR_STEPS) {
  const { dependencies } = deps([reply(answer)]);
  const result = await requestBreakdown(user, { taskId }, dependencies);
  if (!result.ok) throw new Error(`breakdown failed: ${result.error.code} ${result.error.message}`);
  return result.data;
}

/** The suggested steps as the review panel would send them back, unchanged. */
function asItems(steps: Array<{ title: string; minutes: number; deadline: Date | null }>, timeZone = "Asia/Kolkata"): BreakdownItemInput[] {
  return steps.map((step, index) => {
    const local = step.deadline ? toLocalDateTime(step.deadline, timeZone) : null;
    return {
      title: step.title,
      estimateMinutes: step.minutes,
      deadlineDate: local?.date ?? null,
      deadlineTime: local?.time ?? null,
      suggestedIndex: index,
    };
  });
}

const stepsOf = (taskId: string) =>
  db.select().from(tasks).where(eq(tasks.parentTaskId, taskId)).orderBy(asc(tasks.createdAt), asc(tasks.id));

// ---- requestBreakdown --------------------------------------------------------------------------------

describe("requestBreakdown: a good answer", () => {
  it("returns the steps with code-assigned dates and records a pending, valid suggestion", async () => {
    const user = await newStudent();
    const taskId = await newTask(user); // due Friday 6 November, 23:59 India = 18:29Z
    const { dependencies, requests } = deps([reply(FOUR_STEPS, 2500)]);

    const result = await requestBreakdown(user, { taskId }, dependencies);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Hand calculation: now 04:30Z on the 2nd, deadline 18:29Z on the 6th, 109.98 h. Running minutes 60, 120, 240 of 300:
    // 20% -> 3 Nov 02:29Z (07:59 IST) -> due 3 Nov 23:59 IST = 18:29Z; 40% -> 4 Nov 00:29Z (05:59 IST) -> 4 Nov 18:29Z;
    // 80% -> 5 Nov 20:29Z (6 Nov 01:59 IST) -> 6 Nov 23:59 IST, the deadline; the last step is due at the deadline.
    expect(result.data.steps.map((step) => [step.title, step.minutes, step.deadline?.toISOString()])).toEqual([
      ["Review the notes", 60, "2026-11-03T18:29:00.000Z"],
      ["Draw the graph", 60, "2026-11-04T18:29:00.000Z"],
      ["Write the analysis", 120, "2026-11-06T18:29:00.000Z"],
      ["Check and submit", 60, "2026-11-06T18:29:00.000Z"],
    ]);
    expect(result.data.promptVersion).toBe("breakdown.v2");
    expect(result.data.waitedBehind).toBe(0);

    const [row] = await suggestionRows(taskId);
    expect(row).toMatchObject({
      userId: user.id,
      taskId,
      kind: "breakdown",
      model: "llama3.2:3b",
      promptVersion: "breakdown.v2",
      outcome: "pending",
      outputValid: true,
      latencyMs: 2500,
      itemsSuggested: 4,
      itemsKept: null,
      resolvedAt: null,
    });
    expect(row.id).toBe(result.data.suggestionId);
    expect(row.createdAt).toEqual(T0);
    expect(row.outputRaw).toBe(JSON.stringify(FOUR_STEPS));
    // What was sent, and what was shown.
    expect(row.inputSnapshot).toMatchObject({
      title: "Physics lab report",
      description: "Write up the pendulum experiment.",
      existingSteps: [],
      today: "2026-11-02",
      timeZone: "Asia/Kolkata",
      suggested: [
        { title: "Review the notes", minutes: 60, deadline: "2026-11-03T18:29:00.000Z" },
        { title: "Draw the graph", minutes: 60, deadline: "2026-11-04T18:29:00.000Z" },
        { title: "Write the analysis", minutes: 120, deadline: "2026-11-06T18:29:00.000Z" },
        { title: "Check and submit", minutes: 60, deadline: "2026-11-06T18:29:00.000Z" },
      ],
    });
    // The task data reached the model inside the data block.
    expect(requests).toHaveLength(1);
    expect(requests[0].user).toContain("Title: Physics lab report");
  });

  it("a task with no deadline gets steps with no dates", async () => {
    const user = await newStudent();
    const taskId = await newTask(user, { deadlineDate: null });
    const result = await requestBreakdown(user, { taskId }, deps([reply(FOUR_STEPS)]).dependencies);
    expect(result.ok && result.data.steps.map((step) => step.deadline)).toEqual([null, null, null, null]);
  });

  it("a task whose deadline has passed gets steps with no dates", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    setNowForTests(new Date("2026-11-10T04:30:00Z"));
    const result = await requestBreakdown(user, { taskId }, deps([reply(FOUR_STEPS)]).dependencies);
    expect(result.ok && result.data.steps.map((step) => step.deadline)).toEqual([null, null, null, null]);
  });

  it("sends the steps the task already has as 'already planned' and never suggests them again (AI-b)", async () => {
    const user = await newStudent();
    const taskId = await newTask(user, { steps: ["Review the notes", "Collect the data"] });
    const { dependencies, requests } = deps([reply(FOUR_STEPS)]);
    const result = await requestBreakdown(user, { taskId }, dependencies);

    expect(requests[0].user).toContain("Steps already planned");
    expect(requests[0].user).toContain("- Collect the data");
    // "Review the notes" is dropped from the answer; three steps remain.
    expect(result.ok && result.data.steps.map((step) => step.title)).toEqual([
      "Draw the graph",
      "Write the analysis",
      "Check and submit",
    ]);
    const [row] = await suggestionRows(taskId);
    expect(row.itemsSuggested).toBe(3);
    expect(row.inputSnapshot).toMatchObject({ existingSteps: ["Review the notes", "Collect the data"] });
  });

  it("cuts a long description to the prompt limit in the stored snapshot, as it was sent", async () => {
    const user = await newStudent();
    const taskId = await newTask(user, { description: "word ".repeat(600) });
    await requestBreakdown(user, { taskId }, deps([reply(FOUR_STEPS)]).dependencies);
    const [row] = await suggestionRows(taskId);
    const snapshot = row.inputSnapshot as { description: string };
    expect(snapshot.description.endsWith("(shortened)")).toBe(true);
  });
});

describe("requestBreakdown: when the AI does not give a usable answer", () => {
  it("invalid twice: the suggestion is failed, not valid, and closed", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const { dependencies, requests } = deps([reply("not json at all", 700), reply({ steps: [] }, 800)]);
    const result = await requestBreakdown(user, { taskId }, dependencies);

    expect(result).toMatchObject({ ok: false, error: { code: "ai_invalid" } });
    expect(requests).toHaveLength(2);
    const [row] = await suggestionRows(taskId);
    expect(row).toMatchObject({ outcome: "failed", outputValid: false, latencyMs: 1500, itemsSuggested: null });
    expect(row.resolvedAt).toEqual(T0);
    expect(row.outputRaw).toBe(JSON.stringify({ steps: [] }));
  });

  it("Ollama off: a clear code, one try only, a failed row", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const { dependencies, requests } = deps([new OllamaError("offline", "off")]);
    const result = await requestBreakdown(user, { taskId }, dependencies);
    expect(result).toMatchObject({ ok: false, error: { code: "ai_offline" } });
    expect(requests).toHaveLength(1);
    const [row] = await suggestionRows(taskId);
    expect(row).toMatchObject({ outcome: "failed", outputValid: false });
  });

  it("a timeout and a missing model have their own codes", async () => {
    const user = await newStudent();
    const first = await newTask(user);
    expect(await requestBreakdown(user, { taskId: first }, deps([new OllamaError("timeout", "slow")]).dependencies)).toMatchObject({
      error: { code: "ai_timeout" },
    });
    const other = await newStudent();
    const second = await newTask(other);
    expect(
      await requestBreakdown(other, { taskId: second }, deps([new OllamaError("model_missing", "missing")]).dependencies),
    ).toMatchObject({ error: { code: "ai_model_missing" } });
  });
});

describe("requestBreakdown: which tasks can be broken down (AI-a, AI-b)", () => {
  async function refused(user: CurrentUser, taskId: string) {
    const { dependencies, requests } = deps([reply(FOUR_STEPS)]);
    const result = await requestBreakdown(user, { taskId }, dependencies);
    expect(requests).toHaveLength(0); // the model was never asked
    expect(await suggestionRows(taskId)).toHaveLength(0); // and nothing was recorded
    return result;
  }

  it("someone else's task is 'not found'", async () => {
    const owner = await newStudent();
    const stranger = await newStudent();
    const taskId = await newTask(owner);
    expect(await refused(stranger, taskId)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("a task that does not exist is 'not found'", async () => {
    const user = await newStudent();
    const { dependencies } = deps([reply(FOUR_STEPS)]);
    expect(await requestBreakdown(user, { taskId: "11111111-1111-4111-8111-111111111111" }, dependencies)).toMatchObject({
      error: { code: "not_found" },
    });
  });

  it("a Done task is refused", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    await completeTask(user, { taskId, completeAllSteps: false });
    expect(await refused(user, taskId)).toMatchObject({ error: { code: "task_done" } });
  });

  it("a deleted task is refused", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    await deleteTask(user, { taskId });
    expect(await refused(user, taskId)).toMatchObject({ error: { code: "task_deleted" } });
  });

  it("a step cannot be broken down", async () => {
    const user = await newStudent();
    const taskId = await newTask(user, { steps: ["Only step"] });
    const [step] = await stepsOf(taskId);
    expect(await refused(user, step.id)).toMatchObject({ error: { code: "step_of_step" } });
  });

  it("a task with so many steps that fewer than 3 would fit is refused, with the count in the message", async () => {
    const user = await newStudent();
    const taskId = await newTask(user, {
      steps: Array.from({ length: MAX_SUBTASKS_PER_TASK - 2 }, (_, index) => `Step ${index + 1}`),
    });
    const result = await refused(user, taskId);
    expect(result).toMatchObject({ error: { code: "too_many_steps" } });
    expect(!result.ok && result.error.message).toContain(`${MAX_SUBTASKS_PER_TASK - 2} steps`);
  });

  it("a task with exactly room for 3 more is allowed", async () => {
    const user = await newStudent();
    const taskId = await newTask(user, {
      steps: Array.from({ length: MAX_SUBTASKS_PER_TASK - 3 }, (_, index) => `Step ${index + 1}`),
    });
    const result = await requestBreakdown(user, { taskId }, deps([reply(FOUR_STEPS)]).dependencies);
    // The model's four steps are cut to the three that fit.
    expect(result.ok && result.data.steps).toHaveLength(3);
  });
});

describe("requestBreakdown: the line (AI-j)", () => {
  it("a second request right after the first is 'too soon', says how long, and records nothing", async () => {
    const user = await newStudent();
    const first = await newTask(user);
    const second = await newTask(user, { title: "Another task" });
    let time = 1_000_000;
    const queue = createAiQueue({ clock: () => time, cooldownMs: 10_000 });
    const { dependencies } = deps([reply(FOUR_STEPS)], queue);

    expect((await requestBreakdown(user, { taskId: first }, dependencies)).ok).toBe(true);
    time += 3_000;
    const again = await requestBreakdown(user, { taskId: second }, dependencies);
    expect(again).toMatchObject({ ok: false, error: { code: "too_soon" } });
    expect(!again.ok && again.error.message).toContain("7 seconds");
    expect(await suggestionRows(second)).toHaveLength(0);

    time += 7_000;
    expect((await requestBreakdown(user, { taskId: second }, dependencies)).ok).toBe(true);
  });

  it("the model busy and the line full: 'busy', and nothing is recorded", async () => {
    const [a, b] = [await newStudent(), await newStudent()];
    const [taskA, taskB] = [await newTask(a), await newTask(b)];
    let release!: (value: ChatJsonResponse) => void;
    const gate = new Promise<ChatJsonResponse>((resolve) => {
      release = resolve;
    });
    const queue = createAiQueue({ maxWaiting: 0, clock: () => 0 });

    const running = requestBreakdown(a, { taskId: taskA }, deps([() => gate], queue).dependencies);
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the first job reach the model

    const refusedResult = await requestBreakdown(b, { taskId: taskB }, deps([reply(FOUR_STEPS)], queue).dependencies);
    expect(refusedResult).toMatchObject({ ok: false, error: { code: "busy" } });
    expect(await suggestionRows(taskB)).toHaveLength(0);

    release(reply(FOUR_STEPS));
    expect((await running).ok).toBe(true);
  });

  it("the same person asking twice while the first is running: 'you are waiting'", async () => {
    const user = await newStudent();
    const [first, second] = [await newTask(user), await newTask(user, { title: "Second" })];
    let release!: (value: ChatJsonResponse) => void;
    const gate = new Promise<ChatJsonResponse>((resolve) => {
      release = resolve;
    });
    const queue = createAiQueue({ clock: () => 0 });

    const running = requestBreakdown(user, { taskId: first }, deps([() => gate], queue).dependencies);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await requestBreakdown(user, { taskId: second }, deps([reply(FOUR_STEPS)], queue).dependencies)).toMatchObject({
      error: { code: "you_are_waiting" },
    });
    release(reply(FOUR_STEPS));
    await running;
  });

  it("a job stuck past the limit gives up with a timeout and frees the line", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const queue = createAiQueue({ jobMaxMs: 30, clock: () => 0 });
    const stuck = deps([() => new Promise<ChatJsonResponse>(() => {})], queue).dependencies;
    expect(await requestBreakdown(user, { taskId }, stuck)).toMatchObject({ ok: false, error: { code: "ai_timeout" } });
    expect(queue.snapshot()).toEqual({ running: false, waiting: 0 });
  });
});

// ---- Saving the steps --------------------------------------------------------------------------------

describe("createStepsFromBreakdown: accepted exactly as suggested", () => {
  it("saves every step as an AI step, in order, with the AI's estimates and dates, and resolves the suggestion", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    setNowForTests(new Date(T0.getTime() + 90_000));

    const result = await createStepsFromBreakdown(user, {
      taskId,
      suggestionId: suggestion.suggestionId,
      items: asItems(suggestion.steps),
    });
    expect(result).toMatchObject({ ok: true, data: { outcome: "accepted", created: 4, itemsKept: 4 } });

    const steps = await stepsOf(taskId);
    expect(steps.map((step) => step.title)).toEqual(suggestion.steps.map((step) => step.title)); // the order kept
    for (const [index, step] of steps.entries()) {
      expect(step).toMatchObject({
        context: "personal",
        assigneeId: user.id,
        createdBy: user.id,
        source: "ai_breakdown",
        aiSuggestionId: suggestion.suggestionId,
        estimateMinutes: suggestion.steps[index].minutes,
        estimateSource: "ai",
        category: "study",
        priority: "high",
        status: "todo",
      });
      expect(step.deadline).toEqual(suggestion.steps[index].deadline);
      expect(step.originalDeadline).toEqual(suggestion.steps[index].deadline);
    }

    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, steps[0].id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "created", actorId: user.id, toValue: "ai_breakdown" });

    const [row] = await suggestionRows(taskId);
    expect(row).toMatchObject({ outcome: "accepted", itemsSuggested: 4, itemsKept: 4 });
    expect(row.resolvedAt).toEqual(new Date(T0.getTime() + 90_000));

    // Creating steps starts nothing (rule R-a does not apply).
    const [parent] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(parent.status).toBe("todo");
    expect(parent.startedAt).toBeNull();
  });
});

describe("createStepsFromBreakdown: edited", () => {
  it("a changed title is 'edited'; the other steps keep the AI estimate", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    const items = asItems(suggestion.steps);
    items[1] = { ...items[1], title: "Plot T squared against length" };

    const result = await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items });
    expect(result).toMatchObject({ ok: true, data: { outcome: "edited", created: 4, itemsKept: 4 } });
    const steps = await stepsOf(taskId);
    expect(steps.map((step) => step.estimateSource)).toEqual(["ai", "ai", "ai", "ai"]);
    expect(steps[1].title).toBe("Plot T squared against length");
    expect(steps.every((step) => step.source === "ai_breakdown")).toBe(true);
  });

  it("a changed estimate is 'edited' and that step's estimate becomes the student's own", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    const items = asItems(suggestion.steps);
    items[2] = { ...items[2], estimateMinutes: 45 };

    const result = await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items });
    expect(result).toMatchObject({ ok: true, data: { outcome: "edited" } });
    const steps = await stepsOf(taskId);
    expect(steps.map((step) => [step.estimateMinutes, step.estimateSource])).toEqual([
      [60, "ai"],
      [60, "ai"],
      [45, "user"],
      [60, "ai"],
    ]);
  });

  it("a cleared estimate is saved with no estimate and no source", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    const items = asItems(suggestion.steps);
    items[0] = { ...items[0], estimateMinutes: null };
    await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items });
    const [first] = await stepsOf(taskId);
    expect(first).toMatchObject({ estimateMinutes: null, estimateSource: null });
  });

  it("a changed or cleared date is 'edited'", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    const items = asItems(suggestion.steps);
    items[0] = { ...items[0], deadlineDate: "2026-11-04", deadlineTime: "09:00" };
    items[3] = { ...items[3], deadlineDate: null, deadlineTime: null };

    const result = await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items });
    expect(result).toMatchObject({ ok: true, data: { outcome: "edited" } });
    const steps = await stepsOf(taskId);
    expect(steps[0].deadline).toEqual(new Date("2026-11-04T03:30:00Z")); // 09:00 India
    expect(steps[3].deadline).toBeNull();
  });

  it("a removed step is 'edited' and items_kept counts what was kept", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    const items = asItems(suggestion.steps).filter((_, index) => index !== 1);

    const result = await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items });
    expect(result).toMatchObject({ ok: true, data: { outcome: "edited", created: 3, itemsKept: 3 } });
    const [row] = await suggestionRows(taskId);
    expect(row).toMatchObject({ outcome: "edited", itemsSuggested: 4, itemsKept: 3 });
  });

  it("a step the student added is an ordinary step, is not counted in items_kept, and makes it 'edited'", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    const items: BreakdownItemInput[] = [
      ...asItems(suggestion.steps),
      { title: "Ask the lab assistant", estimateMinutes: 15, deadlineDate: null, deadlineTime: null, suggestedIndex: null },
    ];

    const result = await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items });
    expect(result).toMatchObject({ ok: true, data: { outcome: "edited", created: 5, itemsKept: 4 } });

    const steps = await stepsOf(taskId);
    const added = steps.at(-1)!;
    expect(added).toMatchObject({
      title: "Ask the lab assistant",
      source: "manual",
      aiSuggestionId: null,
      estimateMinutes: 15,
      estimateSource: "user",
    });
    const [event] = await db.select().from(taskEvents).where(eq(taskEvents.taskId, added.id));
    expect(event.toValue).toBe("added_in_ai_review");
    const [row] = await suggestionRows(taskId);
    expect(row).toMatchObject({ outcome: "edited", itemsSuggested: 4, itemsKept: 4 });
  });

  it("only steps the student wrote themselves: edited, items_kept 0", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    const result = await createStepsFromBreakdown(user, {
      taskId,
      suggestionId: suggestion.suggestionId,
      items: [{ title: "My own plan", estimateMinutes: null, deadlineDate: null, deadlineTime: null, suggestedIndex: null }],
    });
    expect(result).toMatchObject({ ok: true, data: { outcome: "edited", itemsKept: 0 } });
  });

  it("the steps are added to the ones the task already had", async () => {
    const user = await newStudent();
    const taskId = await newTask(user, { steps: ["Collect the data"] });
    const suggestion = await suggest(user, taskId);
    setNowForTests(new Date(T0.getTime() + 60_000)); // a minute later, as in real use
    await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items: asItems(suggestion.steps) });
    expect((await stepsOf(taskId)).map((step) => step.title)).toEqual([
      "Collect the data",
      ...suggestion.steps.map((step) => step.title),
    ]);
  });
});

describe("createStepsFromBreakdown: what is refused", () => {
  it("someone else's suggestion is 'not found' and saves nothing", async () => {
    const owner = await newStudent();
    const stranger = await newStudent();
    const ownerTask = await newTask(owner);
    const strangerTask = await newTask(stranger);
    const suggestion = await suggest(owner, ownerTask);

    const result = await createStepsFromBreakdown(stranger, {
      taskId: strangerTask,
      suggestionId: suggestion.suggestionId,
      items: asItems(suggestion.steps),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await stepsOf(strangerTask)).toHaveLength(0);
    expect((await suggestionRows(ownerTask))[0].outcome).toBe("pending");
  });

  it("someone else's task is 'not found'", async () => {
    const owner = await newStudent();
    const stranger = await newStudent();
    const taskId = await newTask(owner);
    const suggestion = await suggest(owner, taskId);
    const result = await createStepsFromBreakdown(stranger, {
      taskId,
      suggestionId: suggestion.suggestionId,
      items: asItems(suggestion.steps),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("a suggestion made for another task is refused", async () => {
    const user = await newStudent();
    const taskA = await newTask(user);
    const taskB = await newTask(user, { title: "Another task" });
    const suggestion = await suggest(user, taskA);
    const result = await createStepsFromBreakdown(user, {
      taskId: taskB,
      suggestionId: suggestion.suggestionId,
      items: asItems(suggestion.steps),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "suggestion_mismatch" } });
    expect(await stepsOf(taskB)).toHaveLength(0);
  });

  it("a second save is refused and adds no second set of steps", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    const input = { taskId, suggestionId: suggestion.suggestionId, items: asItems(suggestion.steps) };
    expect((await createStepsFromBreakdown(user, input)).ok).toBe(true);
    expect(await createStepsFromBreakdown(user, input)).toMatchObject({ ok: false, error: { code: "already_resolved" } });
    expect(await stepsOf(taskId)).toHaveLength(4);
  });

  it("a discarded or failed suggestion cannot be saved", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const discarded = await suggest(user, taskId);
    await discardBreakdown(user, { suggestionId: discarded.suggestionId });
    setNowForTests(new Date(T0.getTime() + 60_000));
    expect(
      await createStepsFromBreakdown(user, { taskId, suggestionId: discarded.suggestionId, items: asItems(discarded.steps) }),
    ).toMatchObject({ error: { code: "already_resolved" } });

    const failedTask = await newTask(user, { title: "Failing task" });
    await requestBreakdown(user, { taskId: failedTask }, deps([new OllamaError("offline", "off")]).dependencies);
    const [failed] = await suggestionRows(failedTask);
    expect(
      await createStepsFromBreakdown(user, { taskId: failedTask, suggestionId: failed.id, items: asItems(discarded.steps) }),
    ).toMatchObject({ error: { code: "already_resolved" } });
    expect(await stepsOf(taskId)).toHaveLength(0);
    expect(await stepsOf(failedTask)).toHaveLength(0);
  });

  it("a task finished while the student was reviewing refuses new steps", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    await completeTask(user, { taskId, completeAllSteps: false });
    const result = await createStepsFromBreakdown(user, {
      taskId,
      suggestionId: suggestion.suggestionId,
      items: asItems(suggestion.steps),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "parent_done" } });
    expect(await stepsOf(taskId)).toHaveLength(0);
    expect((await suggestionRows(taskId))[0].outcome).toBe("pending");
  });

  it("a task deleted while the student was reviewing refuses new steps", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    await deleteTask(user, { taskId });
    expect(
      await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items: asItems(suggestion.steps) }),
    ).toMatchObject({ error: { code: "task_deleted" } });
  });

  it("more steps than the task can hold are refused as a whole (the 30-step limit)", async () => {
    const user = await newStudent();
    const taskId = await newTask(user, { steps: Array.from({ length: 5 }, (_, index) => `Step ${index + 1}`) });
    const suggestion = await suggest(user, taskId);
    // While reviewing, 24 more steps are added elsewhere: 29 now, and 4 more would make 33.
    for (let index = 0; index < MAX_SUBTASKS_PER_TASK - 6; index++) {
      const added = await createSubtask(user, {
        taskId,
        title: `Extra ${index + 1}`,
        deadlineDate: null,
        deadlineTime: null,
        estimateMinutes: null,
      });
      expect(added.ok).toBe(true);
    }
    const result = await createStepsFromBreakdown(user, {
      taskId,
      suggestionId: suggestion.suggestionId,
      items: asItems(suggestion.steps),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "too_many_steps" } });
    expect(await stepsOf(taskId)).toHaveLength(MAX_SUBTASKS_PER_TASK - 1);
    expect((await suggestionRows(taskId))[0].outcome).toBe("pending");
  });

  it("a row that names a position the student was never shown is refused", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    const items = asItems(suggestion.steps);
    items[0] = { ...items[0], suggestedIndex: 9 };
    const result = await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await stepsOf(taskId)).toHaveLength(0);
  });

  it("nothing is half saved: a refusal leaves no steps and no events", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    await deleteTask(user, { taskId });
    await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items: asItems(suggestion.steps) });
    const events = await db
      .select()
      .from(taskEvents)
      .where(and(eq(taskEvents.eventType, "created"), eq(taskEvents.toValue, "ai_breakdown")));
    expect(events.filter((event) => event.actorId === user.id)).toHaveLength(0);
  });
});

// ---- Discard and rate ---------------------------------------------------------------------------------

describe("discardBreakdown", () => {
  it("closes a pending suggestion as discarded, at the command's time", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    setNowForTests(new Date(T0.getTime() + 5_000));
    expect(await discardBreakdown(user, { suggestionId: suggestion.suggestionId })).toMatchObject({ ok: true });
    const [row] = await suggestionRows(taskId);
    expect(row).toMatchObject({ outcome: "discarded", itemsKept: null });
    expect(row.resolvedAt).toEqual(new Date(T0.getTime() + 5_000));
    expect(await stepsOf(taskId)).toHaveLength(0);
  });

  it("a second discard, or discarding a saved suggestion, is refused", async () => {
    const user = await newStudent();
    const taskId = await newTask(user);
    const first = await suggest(user, taskId);
    await discardBreakdown(user, { suggestionId: first.suggestionId });
    expect(await discardBreakdown(user, { suggestionId: first.suggestionId })).toMatchObject({
      error: { code: "already_resolved" },
    });

    const secondTask = await newTask(user, { title: "Second" });
    const second = await suggest(user, secondTask);
    await createStepsFromBreakdown(user, { taskId: secondTask, suggestionId: second.suggestionId, items: asItems(second.steps) });
    expect(await discardBreakdown(user, { suggestionId: second.suggestionId })).toMatchObject({
      error: { code: "already_resolved" },
    });
  });

  it("someone else's suggestion is 'not found' and stays pending", async () => {
    const owner = await newStudent();
    const stranger = await newStudent();
    const taskId = await newTask(owner);
    const suggestion = await suggest(owner, taskId);
    expect(await discardBreakdown(stranger, { suggestionId: suggestion.suggestionId })).toMatchObject({
      error: { code: "not_found" },
    });
    expect((await suggestionRows(taskId))[0].outcome).toBe("pending");
  });
});

describe("rateBreakdown (AI-h)", () => {
  async function savedSuggestion(user: CurrentUser) {
    const taskId = await newTask(user);
    const suggestion = await suggest(user, taskId);
    await createStepsFromBreakdown(user, { taskId, suggestionId: suggestion.suggestionId, items: asItems(suggestion.steps) });
    return { taskId, suggestionId: suggestion.suggestionId };
  }

  it("stores the stars and the comment on a saved suggestion", async () => {
    const user = await newStudent();
    const { taskId, suggestionId } = await savedSuggestion(user);
    expect(await rateBreakdown(user, { suggestionId, rating: 4, feedback: "Good start" })).toMatchObject({ ok: true });
    expect((await suggestionRows(taskId))[0]).toMatchObject({ rating: 4, feedbackText: "Good start" });
  });

  it("a comment alone keeps an earlier rating, and a rating alone keeps an earlier comment", async () => {
    const user = await newStudent();
    const { taskId, suggestionId } = await savedSuggestion(user);
    await rateBreakdown(user, { suggestionId, rating: 5, feedback: null });
    await rateBreakdown(user, { suggestionId, rating: null, feedback: "Saved me time" });
    expect((await suggestionRows(taskId))[0]).toMatchObject({ rating: 5, feedbackText: "Saved me time" });
    await rateBreakdown(user, { suggestionId, rating: 3, feedback: null });
    expect((await suggestionRows(taskId))[0]).toMatchObject({ rating: 3, feedbackText: "Saved me time" });
  });

  it("a pending, discarded or failed suggestion cannot be rated", async () => {
    const user = await newStudent();
    const pendingTask = await newTask(user);
    const pending = await suggest(user, pendingTask);
    expect(await rateBreakdown(user, { suggestionId: pending.suggestionId, rating: 5, feedback: null })).toMatchObject({
      error: { code: "not_saved" },
    });

    await discardBreakdown(user, { suggestionId: pending.suggestionId });
    expect(await rateBreakdown(user, { suggestionId: pending.suggestionId, rating: 5, feedback: null })).toMatchObject({
      error: { code: "not_saved" },
    });

    const failedTask = await newTask(user, { title: "Failing" });
    await requestBreakdown(user, { taskId: failedTask }, deps([new OllamaError("offline", "off")]).dependencies);
    const [failed] = await suggestionRows(failedTask);
    expect(await rateBreakdown(user, { suggestionId: failed.id, rating: 1, feedback: "Broken" })).toMatchObject({
      error: { code: "not_saved" },
    });
  });

  it("someone else's suggestion is 'not found'", async () => {
    const owner = await newStudent();
    const stranger = await newStudent();
    const { suggestionId } = await savedSuggestion(owner);
    expect(await rateBreakdown(stranger, { suggestionId, rating: 1, feedback: null })).toMatchObject({
      error: { code: "not_found" },
    });
  });
});
