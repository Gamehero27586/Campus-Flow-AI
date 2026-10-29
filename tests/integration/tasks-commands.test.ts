import { and, asc, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_SUBTASKS_PER_TASK } from "@/config/limits";
import type { CreateTaskInput } from "@/lib/schemas/tasks";
import { resetNowForTests, setNowForTests } from "@/lib/time";
import type { CurrentUser } from "@/server/auth/current-user";
import { taskEvents, tasks } from "@/server/db/schema";
import {
  backfillStart,
  changeDeadline,
  completeTask,
  createSubtask,
  createTask,
  deleteTask,
  moveBackToTodo,
  reopenTask,
  restoreTask,
  startTask,
  updateSubtask,
  updateTask,
} from "@/server/tasks/commands";
import { asCurrentUser, insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// Every status and timestamp rule of docs/data-flows.md §2 for personal tasks, and the owner-confirmed rules
// R-a to R-i (docs/slices/slice-3-plan.md §3), with a fixed clock. The commands run against an in-memory
// Postgres with the real migrations, so the CHECK constraints and the row locks are the real ones.

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

afterEach(() => resetNowForTests());

// 10:00 on Monday 2 November 2026 in India (UTC+5:30).
const T0 = new Date("2026-11-02T04:30:00Z");
const minutes = (count: number) => new Date(T0.getTime() + count * 60_000);
const clock = (count: number) => setNowForTests(minutes(count));

async function newStudent(): Promise<CurrentUser> {
  const row = await insertUser(db, { status: "active", timezone: "Asia/Kolkata" });
  return asCurrentUser(row, "student");
}

function taskInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    title: "Read chapter 4",
    description: null,
    category: "study",
    categoryOther: null,
    priority: "medium",
    deadlineDate: null,
    deadlineTime: null,
    estimateMinutes: null,
    steps: [],
    ...overrides,
  };
}

/** The data of a successful command, or a thrown error that shows the failure. */
function okData(result: { ok: boolean }): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected success, got ${JSON.stringify(result)}`);
  return (result as unknown as { data: Record<string, unknown> }).data;
}

async function makeTask(user: CurrentUser, overrides: Partial<CreateTaskInput> = {}) {
  return okData(await createTask(user, taskInput(overrides))).taskId as string;
}

async function makeStep(user: CurrentUser, parentId: string, title = "Step") {
  return okData(
    await createSubtask(user, {
      taskId: parentId,
      title,
      deadlineDate: null,
      deadlineTime: null,
      estimateMinutes: null,
    }),
  ).taskId as string;
}

async function row(id: string) {
  const [found] = await db.select().from(tasks).where(eq(tasks.id, id));
  return found;
}

async function events(id: string) {
  return db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.taskId, id))
    .orderBy(asc(taskEvents.createdAt), asc(taskEvents.eventType));
}

const failure = (code: string) => expect.objectContaining({ ok: false, error: expect.objectContaining({ code }) });

// ---- Creating ------------------------------------------------------------------------------------

describe("createTask", () => {
  it("stores the app clock's instant in created_at, updated_at and the created event (review A1)", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);

    const task = await row(id);
    expect(task.createdAt).toEqual(T0);
    expect(task.updatedAt).toEqual(T0);
    expect(task.context).toBe("personal");
    expect(task.assigneeId).toBe(user.id);
    expect(task.createdBy).toBe(user.id);
    expect(task.status).toBe("todo");
    expect(task.startedAt).toBeNull();

    const created = await events(id);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ eventType: "created", actorId: user.id });
    expect(created[0].createdAt).toEqual(T0);
  });

  it("a date without a time is due at 23:59 on that day in the user's time zone", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { deadlineDate: "2026-11-10" });
    const task = await row(id);
    expect(task.deadline).toEqual(new Date("2026-11-10T18:29:00Z")); // 23:59 IST
    expect(task.originalDeadline).toEqual(task.deadline);
    expect(task.rescheduleCount).toBe(0);
  });

  it("uses the time when one is given, and a time zone other than India", async () => {
    const row1 = await insertUser(db, { status: "active", timezone: "Europe/London" });
    const london = asCurrentUser(row1, "student");
    clock(0);
    const id = await makeTask(london, { deadlineDate: "2026-03-30", deadlineTime: "12:00" });
    expect((await row(id)).deadline).toEqual(new Date("2026-03-30T11:00:00Z")); // BST, UTC+1
  });

  it("a task without a deadline has neither deadline nor original_deadline", async () => {
    const user = await newStudent();
    clock(0);
    const task = await row(await makeTask(user));
    expect(task.deadline).toBeNull();
    expect(task.originalDeadline).toBeNull();
  });

  it("an estimate is the user's own number", async () => {
    const user = await newStudent();
    clock(0);
    const task = await row(await makeTask(user, { estimateMinutes: 90 }));
    expect(task.estimateMinutes).toBe(90);
    expect(task.estimateSource).toBe("user");
  });

  it("stores the custom category label", async () => {
    const user = await newStudent();
    clock(0);
    const task = await row(await makeTask(user, { category: "other", categoryOther: "Lab" }));
    expect(task.categoryOther).toBe("Lab");
  });

  it("creates the typed steps with the parent's context, owner, category and priority, and an event each", async () => {
    const user = await newStudent();
    clock(0);
    const parentId = await makeTask(user, {
      category: "project",
      priority: "high",
      steps: ["Outline", "Draft"],
    });
    const steps = await db
      .select()
      .from(tasks)
      .where(eq(tasks.parentTaskId, parentId))
      .orderBy(asc(tasks.title));
    expect(steps.map((s) => s.title)).toEqual(["Draft", "Outline"]);
    for (const step of steps) {
      expect(step).toMatchObject({
        context: "personal",
        assigneeId: user.id,
        category: "project",
        priority: "high",
        status: "todo",
        source: "manual",
      });
      expect(step.createdAt).toEqual(T0);
      expect(await events(step.id)).toHaveLength(1);
    }
  });

  it("refuses more than the step limit (R-i)", async () => {
    const user = await newStudent();
    clock(0);
    const steps = Array.from({ length: MAX_SUBTASKS_PER_TASK + 1 }, (_, i) => `Step ${i}`);
    expect(await createTask(user, taskInput({ steps }))).toEqual(failure("too_many_steps"));
  });
});

// ---- Status and timestamps (data-flows.md §2) ----------------------------------------------------

describe("start and move back", () => {
  it("To Do to In progress sets started_at once and writes a status_changed event", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    expect(okData(await startTask(user, { taskId: id }))).toEqual({ taskId: id, parentStarted: false });

    const task = await row(id);
    expect(task.status).toBe("in_progress");
    expect(task.startedAt).toEqual(minutes(10));
    expect(task.updatedAt).toEqual(minutes(10));
    const log = await events(id);
    expect(log.at(-1)).toMatchObject({
      eventType: "status_changed",
      fromValue: "todo",
      toValue: "in_progress",
    });
    expect(log.at(-1)?.createdAt).toEqual(minutes(10));
  });

  it("starting twice is refused", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    await startTask(user, { taskId: id });
    expect(await startTask(user, { taskId: id })).toEqual(failure("already_started"));
  });

  it("back to To Do keeps started_at, and starting again does not overwrite it", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    await startTask(user, { taskId: id });
    clock(20);
    await moveBackToTodo(user, { taskId: id });
    expect(await row(id)).toMatchObject({ status: "todo", startedAt: minutes(10) });
    clock(30);
    await startTask(user, { taskId: id });
    expect(await row(id)).toMatchObject({ status: "in_progress", startedAt: minutes(10) });
  });

  it("moving back a task that is not in progress is refused", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    expect(await moveBackToTodo(user, { taskId: id })).toEqual(failure("not_in_progress"));
  });

  it("starting a Done task is refused", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    expect(await startTask(user, { taskId: id })).toEqual(failure("task_done"));
  });
});

describe("complete and reopen", () => {
  it("In progress to Done sets completed_at; started_at stays", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    await startTask(user, { taskId: id });
    clock(60);
    const result = okData(await completeTask(user, { taskId: id, completeAllSteps: false }));
    expect(result.askStartTime).toBe(false);
    expect(await row(id)).toMatchObject({
      status: "done",
      startedAt: minutes(10),
      completedAt: minutes(60),
    });
  });

  it("To Do straight to Done leaves started_at empty and asks for the start time once", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(60);
    const result = okData(await completeTask(user, { taskId: id, completeAllSteps: false }));
    expect(result.askStartTime).toBe(true);
    expect(await row(id)).toMatchObject({ status: "done", startedAt: null, completedAt: minutes(60) });
  });

  it("Done, reopened, Done again: completed_at is the latest, started_at the first", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    await startTask(user, { taskId: id });
    clock(60);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    clock(120);
    await reopenTask(user, { taskId: id, to: "in_progress" });
    expect(await row(id)).toMatchObject({
      status: "in_progress",
      completedAt: null,
      startedAt: minutes(10),
    });
    clock(180);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    expect(await row(id)).toMatchObject({
      status: "done",
      completedAt: minutes(180),
      startedAt: minutes(10),
    });
    const types = (await events(id)).map((e) => e.eventType);
    expect(types).toEqual(["created", "status_changed", "status_changed", "reopened", "status_changed"]);
  });

  it("reopen to To Do keeps started_at; the event records the new status", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    await startTask(user, { taskId: id });
    clock(60);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    clock(70);
    await reopenTask(user, { taskId: id, to: "todo" });
    expect(await row(id)).toMatchObject({ status: "todo", completedAt: null, startedAt: minutes(10) });
    expect((await events(id)).at(-1)).toMatchObject({
      eventType: "reopened",
      fromValue: "done",
      toValue: "todo",
    });
  });

  it("reopening to In progress a task that was never started gives it a start now", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(60);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    clock(90);
    await reopenTask(user, { taskId: id, to: "in_progress" });
    expect(await row(id)).toMatchObject({ status: "in_progress", startedAt: minutes(90) });
  });

  it("reopening a task that is not Done is refused, and completing twice is refused", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    expect(await reopenTask(user, { taskId: id, to: "todo" })).toEqual(failure("not_done"));
    await completeTask(user, { taskId: id, completeAllSteps: false });
    expect(await completeTask(user, { taskId: id, completeAllSteps: false })).toEqual(
      failure("already_done"),
    );
  });
});

describe("completing a task that has steps", () => {
  it("is refused while a step is not done, and nothing changes", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    clock(30);
    const result = await completeTask(user, { taskId: id, completeAllSteps: false });
    expect(result).toEqual(failure("open_steps"));
    expect(result).toMatchObject({ error: { message: expect.stringContaining("2 steps are not done") } });
    expect((await row(id)).status).toBe("todo");
  });

  it("with 'complete all' the steps finish at the same instant, each with an event", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    clock(30);
    const [first] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id)).orderBy(asc(tasks.title));
    await startTask(user, { taskId: first.id });
    clock(60);
    await completeTask(user, { taskId: id, completeAllSteps: true });

    const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    for (const step of steps) {
      expect(step).toMatchObject({ status: "done", completedAt: minutes(60) });
      expect((await events(step.id)).at(-1)).toMatchObject({
        eventType: "status_changed",
        toValue: "done",
      });
    }
    expect(await row(id)).toMatchObject({ status: "done", completedAt: minutes(60) });
  });

  it("works without 'complete all' when every step is already done", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(30);
    await completeTask(user, { taskId: step.id, completeAllSteps: false });
    clock(40);
    expect(okData(await completeTask(user, { taskId: id, completeAllSteps: false }))).toMatchObject({
      taskId: id,
    });
  });

  it("completing the last step does not complete the parent (it only starts it, R-a2)", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(30);
    await completeTask(user, { taskId: step.id, completeAllSteps: false });
    expect(await row(id)).toMatchObject({ status: "in_progress", completedAt: null });
  });

  it("a deleted step does not block completing the parent", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(10);
    await deleteTask(user, { taskId: step.id });
    clock(20);
    expect(okData(await completeTask(user, { taskId: id, completeAllSteps: false }))).toMatchObject({
      taskId: id,
    });
  });

  it("a step never asks 'When did you start?'", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(30);
    expect(okData(await completeTask(user, { taskId: step.id, completeAllSteps: false })).askStartTime).toBe(
      false,
    );
  });
});

describe("backfillStart ('When did you start?')", () => {
  async function finishedTask(user: CurrentUser) {
    clock(0); // created 10:00 IST
    const id = await makeTask(user);
    clock(180); // finished 13:00 IST
    await completeTask(user, { taskId: id, completeAllSteps: false });
    clock(240);
    return id;
  }

  it("sets started_at from the local date and time and writes start_backfilled", async () => {
    const user = await newStudent();
    const id = await finishedTask(user);
    expect(
      await backfillStart(user, { taskId: id, startDate: "2026-11-02", startTime: "11:00" }),
    ).toMatchObject({ ok: true });
    const task = await row(id);
    expect(task.startedAt).toEqual(new Date("2026-11-02T05:30:00Z"));
    expect((await events(id)).at(-1)).toMatchObject({
      eventType: "start_backfilled",
      fromValue: null,
      toValue: "2026-11-02T05:30:00.000Z",
    });
  });

  it("accepts exactly the creation instant and exactly the finish instant", async () => {
    const user = await newStudent();
    const id = await finishedTask(user);
    expect(
      await backfillStart(user, { taskId: id, startDate: "2026-11-02", startTime: "10:00" }),
    ).toMatchObject({ ok: true });
    const other = await finishedTask(user);
    expect(
      await backfillStart(user, { taskId: other, startDate: "2026-11-02", startTime: "13:00" }),
    ).toMatchObject({ ok: true });
  });

  it("refuses a start before the task was created", async () => {
    const user = await newStudent();
    const id = await finishedTask(user);
    expect(
      await backfillStart(user, { taskId: id, startDate: "2026-11-02", startTime: "09:59" }),
    ).toEqual(failure("start_too_early"));
    expect((await row(id)).startedAt).toBeNull();
  });

  it("refuses a start after the task was finished", async () => {
    const user = await newStudent();
    const id = await finishedTask(user);
    expect(
      await backfillStart(user, { taskId: id, startDate: "2026-11-02", startTime: "13:01" }),
    ).toEqual(failure("start_after_finish"));
  });

  it("refuses when a start already exists, and the first one is kept", async () => {
    const user = await newStudent();
    const id = await finishedTask(user);
    await backfillStart(user, { taskId: id, startDate: "2026-11-02", startTime: "11:00" });
    expect(
      await backfillStart(user, { taskId: id, startDate: "2026-11-02", startTime: "12:00" }),
    ).toEqual(failure("start_already_set"));
    expect((await row(id)).startedAt).toEqual(new Date("2026-11-02T05:30:00Z"));
  });

  it("is refused on a task that is not Done", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    expect(
      await backfillStart(user, { taskId: id, startDate: "2026-11-02", startTime: "10:30" }),
    ).toEqual(failure("not_done"));
  });
});

describe("changeDeadline", () => {
  it("C1: a Done task's deadline cannot be moved, so a late task cannot become on time afterwards", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { deadlineDate: "2026-11-02" }); // due 23:59 IST on the day it was made
    clock(24 * 60); // finished the next day: late
    await completeTask(user, { taskId: id, completeAllSteps: false });
    const before = await row(id);
    const eventsBefore = (await events(id)).length;

    clock(24 * 60 + 5);
    const result = await changeDeadline(user, { taskId: id, deadlineDate: "2026-11-10", deadlineTime: null });
    expect(result).toEqual(failure("task_done"));
    expect(result).toMatchObject({ error: { message: "Reopen the task to change its deadline." } });
    expect(await row(id)).toEqual(before);
    expect((await events(id)).length).toBe(eventsBefore);
  });

  it("C1: after reopening, the deadline can be moved, and the later finish is measured against it", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { deadlineDate: "2026-11-02" });
    clock(24 * 60);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    clock(24 * 60 + 5);
    await reopenTask(user, { taskId: id, to: "in_progress" });
    clock(24 * 60 + 10);
    expect(
      okData(await changeDeadline(user, { taskId: id, deadlineDate: "2026-11-10", deadlineTime: null })),
    ).toMatchObject({ changed: true });
    const task = await row(id);
    expect(task.deadline).toEqual(new Date("2026-11-10T18:29:00Z"));
    expect(task.rescheduleCount).toBe(1);
    expect(task.completedAt).toBeNull();
  });

  it("C1: the same applies to a Done step", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(10);
    await completeTask(user, { taskId: step.id, completeAllSteps: false });
    expect(
      await changeDeadline(user, { taskId: step.id, deadlineDate: "2026-11-10", deadlineTime: null }),
    ).toEqual(failure("task_done"));
  });

  it("moving later keeps original_deadline, adds one to reschedule_count and logs the change", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { deadlineDate: "2026-11-10" });
    clock(10);
    await changeDeadline(user, { taskId: id, deadlineDate: "2026-11-12", deadlineTime: null });
    const task = await row(id);
    expect(task.deadline).toEqual(new Date("2026-11-12T18:29:00Z"));
    expect(task.originalDeadline).toEqual(new Date("2026-11-10T18:29:00Z"));
    expect(task.rescheduleCount).toBe(1);
    expect((await events(id)).at(-1)).toMatchObject({
      eventType: "deadline_changed",
      fromValue: "2026-11-10T18:29:00.000Z",
      toValue: "2026-11-12T18:29:00.000Z",
    });
  });

  it("moving earlier does not add to reschedule_count", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { deadlineDate: "2026-11-10" });
    await changeDeadline(user, { taskId: id, deadlineDate: "2026-11-08", deadlineTime: null });
    const task = await row(id);
    expect(task.rescheduleCount).toBe(0);
    expect(task.deadline).toEqual(new Date("2026-11-08T18:29:00Z"));
    expect(task.originalDeadline).toEqual(new Date("2026-11-10T18:29:00Z"));
  });

  it("moving later twice counts twice, and original_deadline stays the first deadline", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { deadlineDate: "2026-11-10" });
    await changeDeadline(user, { taskId: id, deadlineDate: "2026-11-11", deadlineTime: null });
    await changeDeadline(user, { taskId: id, deadlineDate: "2026-11-12", deadlineTime: "09:00" });
    const task = await row(id);
    expect(task.rescheduleCount).toBe(2);
    expect(task.originalDeadline).toEqual(new Date("2026-11-10T18:29:00Z"));
  });

  it("the same deadline again changes nothing and writes no event", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { deadlineDate: "2026-11-10" });
    const before = (await events(id)).length;
    const result = await changeDeadline(user, { taskId: id, deadlineDate: "2026-11-10", deadlineTime: null });
    expect(okData(result)).toMatchObject({ changed: false });
    expect((await events(id)).length).toBe(before);
    expect((await row(id)).rescheduleCount).toBe(0);
  });

  it("the first deadline on a task that had none sets original_deadline and is not a reschedule", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    await changeDeadline(user, { taskId: id, deadlineDate: "2026-11-10", deadlineTime: null });
    const task = await row(id);
    expect(task.deadline).toEqual(new Date("2026-11-10T18:29:00Z"));
    expect(task.originalDeadline).toEqual(task.deadline);
    expect(task.rescheduleCount).toBe(0);
    expect((await events(id)).at(-1)).toMatchObject({ eventType: "deadline_changed", fromValue: null });
  });
});

describe("editing", () => {
  it("updateTask changes the fields, keeps an unchanged estimate's source and sets the user as source for a new number", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { estimateMinutes: 30 });
    await db.update(tasks).set({ estimateSource: "ai" }).where(eq(tasks.id, id));
    clock(5);
    await updateTask(user, {
      taskId: id,
      title: "New title",
      description: "Notes",
      category: "reading",
      categoryOther: null,
      priority: "high",
      estimateMinutes: 30,
    });
    expect(await row(id)).toMatchObject({
      title: "New title",
      description: "Notes",
      category: "reading",
      priority: "high",
      estimateMinutes: 30,
      estimateSource: "ai",
      updatedAt: minutes(5),
    });
    await updateTask(user, {
      taskId: id,
      title: "New title",
      description: null,
      category: "reading",
      categoryOther: null,
      priority: "high",
      estimateMinutes: 45,
    });
    expect(await row(id)).toMatchObject({ estimateMinutes: 45, estimateSource: "user" });
    await updateTask(user, {
      taskId: id,
      title: "New title",
      description: null,
      category: "reading",
      categoryOther: null,
      priority: "high",
      estimateMinutes: null,
    });
    expect(await row(id)).toMatchObject({ estimateMinutes: null, estimateSource: null });
  });

  it("R-d: changing the parent's category and priority is followed by every step, deleted ones too", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    const [one] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id)).orderBy(asc(tasks.title));
    clock(5);
    await deleteTask(user, { taskId: one.id });
    clock(10);
    await updateTask(user, {
      taskId: id,
      title: "Read chapter 4",
      description: null,
      category: "other",
      categoryOther: "Lab",
      priority: "low",
      estimateMinutes: null,
    });
    const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      expect(step).toMatchObject({ category: "other", categoryOther: "Lab", priority: "low" });
    }
  });

  it("updateTask is refused on a step, and updateSubtask on a top-level task", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    expect(
      await updateTask(user, {
        taskId: step.id,
        title: "x",
        description: null,
        category: "study",
        categoryOther: null,
        priority: "low",
        estimateMinutes: null,
      }),
    ).toEqual(failure("is_step"));
    expect(
      await updateSubtask(user, { taskId: id, title: "x", estimateMinutes: null }),
    ).toEqual(failure("not_a_step"));
  });

  it("updateSubtask changes a step's title and estimate only", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { priority: "high", steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    await updateSubtask(user, { taskId: step.id, title: "Renamed", estimateMinutes: 20 });
    expect(await row(step.id)).toMatchObject({
      title: "Renamed",
      estimateMinutes: 20,
      estimateSource: "user",
      priority: "high",
    });
  });
});

// ---- Steps: rules R-a to R-e --------------------------------------------------------------------

describe("steps", () => {
  it("R-d: a step copies the parent's context, owner, category (and label) and priority", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { category: "other", categoryOther: "Lab", priority: "high" });
    clock(5);
    const stepId = await makeStep(user, id, "Set up");
    const step = await row(stepId);
    expect(step).toMatchObject({
      parentTaskId: id,
      context: "personal",
      assigneeId: user.id,
      category: "other",
      categoryOther: "Lab",
      priority: "high",
      status: "todo",
      createdAt: minutes(5),
    });
    expect((await events(stepId))[0]).toMatchObject({ eventType: "created" });
  });

  it("a step can have its own deadline and estimate", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    const result = await createSubtask(user, {
      taskId: id,
      title: "Draft",
      deadlineDate: "2026-11-05",
      deadlineTime: "17:00",
      estimateMinutes: 40,
    });
    const step = await row(okData(result).taskId as string);
    expect(step.deadline).toEqual(new Date("2026-11-05T11:30:00Z"));
    expect(step.originalDeadline).toEqual(step.deadline);
    expect(step).toMatchObject({ estimateMinutes: 40, estimateSource: "user" });
  });

  it("R-e: a step deadline after the parent's is allowed", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { deadlineDate: "2026-11-05" });
    const result = await createSubtask(user, {
      taskId: id,
      title: "Late step",
      deadlineDate: "2026-11-20",
      deadlineTime: null,
      estimateMinutes: null,
    });
    expect(result.ok).toBe(true);
  });

  it("a step cannot have its own steps", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    const stepId = await makeStep(user, id);
    expect(
      await createSubtask(user, {
        taskId: stepId,
        title: "Nested",
        deadlineDate: null,
        deadlineTime: null,
        estimateMinutes: null,
      }),
    ).toEqual(failure("step_of_step"));
  });

  it("R-b: no new steps on a Done parent", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    const result = await createSubtask(user, {
      taskId: id,
      title: "Late",
      deadlineDate: null,
      deadlineTime: null,
      estimateMinutes: null,
    });
    expect(result).toEqual(failure("parent_done"));
    expect(result).toMatchObject({ error: { message: "Reopen the task to add steps." } });
  });

  it("R-i: at most 30 steps; deleted steps do not count", async () => {
    const user = await newStudent();
    clock(0);
    const titles = Array.from({ length: MAX_SUBTASKS_PER_TASK }, (_, i) => `Step ${i}`);
    const id = await makeTask(user, { steps: titles });
    const over = () =>
      createSubtask(user, {
        taskId: id,
        title: "One too many",
        deadlineDate: null,
        deadlineTime: null,
        estimateMinutes: null,
      });
    expect(await over()).toEqual(failure("too_many_steps"));
    const [first] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id)).limit(1);
    clock(5);
    await deleteTask(user, { taskId: first.id });
    expect((await over()).ok).toBe(true);
  });

  it("R-a: starting a step while the parent is To Do also starts the parent, with its own event", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(15);
    await startTask(user, { taskId: step.id });

    expect(await row(step.id)).toMatchObject({ status: "in_progress", startedAt: minutes(15) });
    expect(await row(id)).toMatchObject({ status: "in_progress", startedAt: minutes(15) });
    expect((await events(id)).at(-1)).toMatchObject({
      eventType: "status_changed",
      fromValue: "todo",
      toValue: "in_progress",
    });
    expect((await events(step.id)).at(-1)).toMatchObject({ toValue: "in_progress" });
  });

  it("R-a: a parent already in progress is left alone, and a parent's earlier started_at is kept", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, id)).orderBy(asc(tasks.title));
    clock(10);
    await startTask(user, { taskId: id });
    clock(20);
    await startTask(user, { taskId: steps[0].id });
    expect(await row(id)).toMatchObject({ status: "in_progress", startedAt: minutes(10) });
    // Moved back to To Do (started_at kept), then a step starts: the parent restarts, keeping the first start.
    clock(30);
    await moveBackToTodo(user, { taskId: id });
    clock(40);
    await startTask(user, { taskId: steps[1].id });
    expect(await row(id)).toMatchObject({ status: "in_progress", startedAt: minutes(10) });
  });

  it("R-a2: completing a step straight from To Do while the parent is To Do also starts the parent", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id)).limit(1);
    clock(25);
    const result = okData(await completeTask(user, { taskId: step.id, completeAllSteps: false }));

    expect(result.parentStarted).toBe(true);
    expect(await row(step.id)).toMatchObject({ status: "done", completedAt: minutes(25), startedAt: null });
    expect(await row(id)).toMatchObject({ status: "in_progress", startedAt: minutes(25), completedAt: null });
    expect((await events(id)).at(-1)).toMatchObject({
      eventType: "status_changed",
      fromValue: "todo",
      toValue: "in_progress",
    });
    expect((await events(id)).at(-1)?.createdAt).toEqual(minutes(25));
  });

  it("R-a2: a parent already in progress is left alone, and so is its started_at", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, id)).orderBy(asc(tasks.title));
    clock(10);
    await startTask(user, { taskId: id });
    clock(25);
    const result = okData(await completeTask(user, { taskId: steps[0].id, completeAllSteps: false }));
    expect(result.parentStarted).toBe(false);
    expect(await row(id)).toMatchObject({ status: "in_progress", startedAt: minutes(10) });
  });

  it("R-a2: a parent that was moved back to To Do keeps its first started_at when a step is completed", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(10);
    await startTask(user, { taskId: id });
    clock(20);
    await moveBackToTodo(user, { taskId: id });
    clock(30);
    await completeTask(user, { taskId: step.id, completeAllSteps: false });
    expect(await row(id)).toMatchObject({ status: "in_progress", startedAt: minutes(10) });
  });

  it("R-a and R-a2 tell the screen when the parent was started with the step", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, id)).orderBy(asc(tasks.title));
    clock(5);
    expect(okData(await startTask(user, { taskId: steps[0].id })).parentStarted).toBe(true);
    clock(6);
    expect(okData(await startTask(user, { taskId: steps[1].id })).parentStarted).toBe(false);
    // A top-level task never reports a started parent.
    const other = await makeTask(user);
    expect(okData(await startTask(user, { taskId: other })).parentStarted).toBe(false);
  });

  it("completing a step with 'complete all' off never touches a Done parent's step rules (R-c still holds)", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    clock(5);
    await completeTask(user, { taskId: id, completeAllSteps: true });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    expect(step.status).toBe("done");
    expect((await row(id)).status).toBe("done");
  });

  it("R-c: a step of a Done parent cannot be reopened", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    clock(10);
    await completeTask(user, { taskId: id, completeAllSteps: true });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    const result = await reopenTask(user, { taskId: step.id, to: "in_progress" });
    expect(result).toEqual(failure("parent_done"));
    expect(result).toMatchObject({ error: { message: "Reopen the task first." } });
    // After reopening the parent, the step can be reopened.
    clock(20);
    await reopenTask(user, { taskId: id, to: "in_progress" });
    clock(30);
    expect((await reopenTask(user, { taskId: step.id, to: "in_progress" })).ok).toBe(true);
  });
});

// ---- Delete and restore: rules R-f to R-h --------------------------------------------------------

describe("delete and restore", () => {
  it("deleting soft-deletes with the reason user_deleted and writes a deleted event", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    await deleteTask(user, { taskId: id });
    expect(await row(id)).toMatchObject({
      deletedAt: minutes(10),
      deletedReason: "user_deleted",
      updatedAt: minutes(10),
    });
    expect((await events(id)).at(-1)).toMatchObject({ eventType: "deleted" });
    expect(await deleteTask(user, { taskId: id })).toEqual(failure("already_deleted"));
  });

  it("R-f: deleting a parent soft-deletes its steps with the same time and reason, one event each", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    clock(10);
    await deleteTask(user, { taskId: id });
    const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    for (const step of steps) {
      expect(step).toMatchObject({ deletedAt: minutes(10), deletedReason: "user_deleted" });
      expect((await events(step.id)).at(-1)).toMatchObject({ eventType: "deleted" });
    }
  });

  it("deleting one step leaves the parent and the other step", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    const [one, two] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id)).orderBy(asc(tasks.title));
    clock(10);
    await deleteTask(user, { taskId: one.id });
    expect((await row(id)).deletedAt).toBeNull();
    expect((await row(two.id)).deletedAt).toBeNull();
  });

  it("every other action on a deleted task is refused with 'restore it first'", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(5);
    await deleteTask(user, { taskId: id });
    clock(10);
    const refused = failure("task_deleted");
    expect(await startTask(user, { taskId: id })).toEqual(refused);
    expect(await completeTask(user, { taskId: id, completeAllSteps: true })).toEqual(refused);
    expect(
      await changeDeadline(user, { taskId: id, deadlineDate: "2026-12-01", deadlineTime: null }),
    ).toEqual(refused);
    expect(
      await createSubtask(user, {
        taskId: id,
        title: "x",
        deadlineDate: null,
        deadlineTime: null,
        estimateMinutes: null,
      }),
    ).toEqual(refused);
  });

  it("R-h: restoring clears the deletion fields and writes a restored event", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(5);
    await deleteTask(user, { taskId: id });
    clock(10);
    await restoreTask(user, { taskId: id });
    expect(await row(id)).toMatchObject({
      deletedAt: null,
      deletedReason: null,
      updatedAt: minutes(10),
    });
    expect((await events(id)).at(-1)).toMatchObject({ eventType: "restored" });
    expect(await restoreTask(user, { taskId: id })).toEqual(failure("not_deleted"));
  });

  it("restoring keeps the task's status and timestamps", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(5);
    await startTask(user, { taskId: id });
    clock(10);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    clock(15);
    await deleteTask(user, { taskId: id });
    clock(20);
    await restoreTask(user, { taskId: id });
    expect(await row(id)).toMatchObject({
      status: "done",
      startedAt: minutes(5),
      completedAt: minutes(10),
    });
  });

  it("R-g: restoring a parent restores the steps deleted at the same moment, not earlier ones", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two", "Three"] });
    const [one, two, three] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.parentTaskId, id))
      .orderBy(asc(tasks.title));
    clock(5);
    await deleteTask(user, { taskId: one.id }); // deleted on its own, earlier
    clock(10);
    await deleteTask(user, { taskId: id }); // takes Two and Three with it
    clock(20);
    await restoreTask(user, { taskId: id });

    expect((await row(id)).deletedAt).toBeNull();
    expect((await row(two.id)).deletedAt).toBeNull();
    expect((await row(three.id)).deletedAt).toBeNull();
    expect(await row(one.id)).toMatchObject({ deletedAt: minutes(5), deletedReason: "user_deleted" });
    expect((await events(two.id)).at(-1)).toMatchObject({ eventType: "restored" });
    expect((await events(one.id)).at(-1)).toMatchObject({ eventType: "deleted" });
  });

  it("R-g: a step cannot be restored while its parent is deleted", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(10);
    await deleteTask(user, { taskId: id });
    clock(20);
    const result = await restoreTask(user, { taskId: step.id });
    expect(result).toEqual(failure("parent_deleted"));
    expect(result).toMatchObject({ error: { message: "Restore the task first." } });
    expect((await row(step.id)).deletedAt).not.toBeNull();
  });

  it("a step deleted on its own can be restored by itself", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(10);
    await deleteTask(user, { taskId: step.id });
    clock(20);
    expect((await restoreTask(user, { taskId: step.id })).ok).toBe(true);
    expect((await row(step.id)).deletedAt).toBeNull();
  });

  it("a step that is not done cannot come back into a Done parent", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { steps: ["One", "Two"] });
    const [one, two] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id)).orderBy(asc(tasks.title));
    clock(5);
    await deleteTask(user, { taskId: one.id });
    clock(10);
    await completeTask(user, { taskId: id, completeAllSteps: true }); // finishes Two; deleted One is ignored
    expect((await row(two.id)).status).toBe("done");
    clock(20);
    expect(await restoreTask(user, { taskId: one.id })).toEqual(failure("parent_done"));
    clock(30);
    await reopenTask(user, { taskId: id, to: "in_progress" });
    clock(40);
    expect((await restoreTask(user, { taskId: one.id })).ok).toBe(true);
  });
});

// ---- Other people's tasks, and anything that is not a personal task ------------------------------

describe("a command only ever touches the acting user's own personal task", () => {
  const commands: Array<[string, (user: CurrentUser, taskId: string) => Promise<{ ok: boolean }>]> = [
    ["startTask", (u, id) => startTask(u, { taskId: id })],
    ["moveBackToTodo", (u, id) => moveBackToTodo(u, { taskId: id })],
    ["completeTask", (u, id) => completeTask(u, { taskId: id, completeAllSteps: true })],
    ["reopenTask", (u, id) => reopenTask(u, { taskId: id, to: "todo" })],
    ["deleteTask", (u, id) => deleteTask(u, { taskId: id })],
    ["restoreTask", (u, id) => restoreTask(u, { taskId: id })],
    [
      "changeDeadline",
      (u, id) => changeDeadline(u, { taskId: id, deadlineDate: "2026-12-01", deadlineTime: null }),
    ],
    [
      "updateTask",
      (u, id) =>
        updateTask(u, {
          taskId: id,
          title: "Hijacked",
          description: null,
          category: "study",
          categoryOther: null,
          priority: "low",
          estimateMinutes: null,
        }),
    ],
    ["updateSubtask", (u, id) => updateSubtask(u, { taskId: id, title: "Hijacked", estimateMinutes: null })],
    [
      "createSubtask",
      (u, id) =>
        createSubtask(u, {
          taskId: id,
          title: "Hijacked",
          deadlineDate: null,
          deadlineTime: null,
          estimateMinutes: null,
        }),
    ],
    [
      "backfillStart",
      (u, id) => backfillStart(u, { taskId: id, startDate: "2026-11-02", startTime: "10:30" }),
    ],
  ];

  it.each(commands)("%s on another student's task is 'not found' and changes nothing", async (_name, run) => {
    const owner = await newStudent();
    const intruder = await newStudent();
    clock(0);
    const id = await makeTask(owner, { steps: ["One"] });
    const before = await db.select().from(tasks).where(eq(tasks.id, id));
    const eventCount = (await db.select().from(taskEvents)).length;

    expect(await run(intruder, id)).toEqual(failure("not_found"));

    expect(await db.select().from(tasks).where(eq(tasks.id, id))).toEqual(before);
    expect((await db.select().from(taskEvents)).length).toBe(eventCount);
  });

  it("a task that does not exist is 'not found'", async () => {
    const user = await newStudent();
    expect(await startTask(user, { taskId: "99999999-9999-4999-8999-999999999999" })).toEqual(
      failure("not_found"),
    );
  });

  it("an assignment task of the same student is not a personal task: not found", async () => {
    const student = await newStudent();
    const teacher = await insertUser(db, { status: "active" });
    const [assignmentTask] = await db
      .insert(tasks)
      .values({
        context: "assignment",
        createdBy: teacher.id,
        assigneeId: student.id,
        assignmentId: "44444444-4444-4444-8444-444444444444",
        title: "Lab report",
        category: "assignment",
        createdAt: T0,
        updatedAt: T0,
      })
      .returning();
    clock(10);
    expect(await completeTask(student, { taskId: assignmentTask.id, completeAllSteps: true })).toEqual(
      failure("not_found"),
    );
    expect((await row(assignmentTask.id)).status).toBe("todo");
  });
});

// ---- Two tabs ------------------------------------------------------------------------------------

describe("two tabs: the second change is checked against the current row, not the page's copy", () => {
  it("both tabs press Done: the second is refused and completed_at is the first one's", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    clock(20);
    expect(await completeTask(user, { taskId: id, completeAllSteps: false })).toEqual(
      failure("already_done"),
    );
    expect((await row(id)).completedAt).toEqual(minutes(10));
  });

  it("one tab completes, the other presses Start: refused", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    expect(await startTask(user, { taskId: id })).toEqual(failure("task_done"));
  });

  it("one tab adds a step, the other presses Done without 'complete all': refused", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    await makeStep(user, id);
    expect(await completeTask(user, { taskId: id, completeAllSteps: false })).toEqual(
      failure("open_steps"),
    );
  });

  it("one tab deletes, the other deletes again: the second is refused", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    await deleteTask(user, { taskId: id });
    expect(await deleteTask(user, { taskId: id })).toEqual(failure("already_deleted"));
  });

  it("two commands started at the same moment: only one of them wins", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    clock(10);
    const results = await Promise.all([
      startTask(user, { taskId: id }),
      startTask(user, { taskId: id }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    const started = (await events(id)).filter((e) => e.eventType === "status_changed");
    expect(started).toHaveLength(1);
  });
});

// ---- The log is complete -------------------------------------------------------------------------

describe("task_events", () => {
  it("every command stamps its events with the command's clock and the acting user", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user, { deadlineDate: "2026-11-10" });
    clock(1);
    await startTask(user, { taskId: id });
    clock(2);
    await changeDeadline(user, { taskId: id, deadlineDate: "2026-11-11", deadlineTime: null });
    clock(3);
    await completeTask(user, { taskId: id, completeAllSteps: false });
    clock(4);
    await reopenTask(user, { taskId: id, to: "in_progress" });
    clock(5);
    await deleteTask(user, { taskId: id });
    clock(6);
    await restoreTask(user, { taskId: id });

    const log = await db
      .select()
      .from(taskEvents)
      .where(and(eq(taskEvents.taskId, id)))
      .orderBy(asc(taskEvents.createdAt));
    expect(log.map((e) => [e.eventType, e.createdAt.getTime()])).toEqual([
      ["created", minutes(0).getTime()],
      ["status_changed", minutes(1).getTime()],
      ["deadline_changed", minutes(2).getTime()],
      ["status_changed", minutes(3).getTime()],
      ["reopened", minutes(4).getTime()],
      ["deleted", minutes(5).getTime()],
      ["restored", minutes(6).getTime()],
    ]);
    expect(new Set(log.map((e) => e.actorId))).toEqual(new Set([user.id]));
  });

  it("a refused command writes nothing", async () => {
    const user = await newStudent();
    clock(0);
    const id = await makeTask(user);
    const before = (await events(id)).length;
    await reopenTask(user, { taskId: id, to: "todo" });
    await moveBackToTodo(user, { taskId: id });
    expect((await events(id)).length).toBe(before);
    const live = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
    expect(live).toHaveLength(1);
  });
});
