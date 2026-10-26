import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetNowForTests, setNowForTests } from "@/lib/time";
import type { CurrentUser } from "@/server/auth/current-user";
import { PERMISSIONS } from "@/server/auth/permission-keys";
import { tasks } from "@/server/db/schema";
import {
  completeTask,
  createSubtask,
  createTask,
  deleteTask,
  startTask,
} from "@/server/tasks/commands";
import {
  findTaskTarget,
  getMyTask,
  listMyDeletedTasks,
  listMyTasks,
  loadPersonalTask,
} from "@/server/tasks/queries";
import { asCurrentUser, insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// What each query shows, and above all what it does NOT show. Personal tasks are tier 1 data
// (docs/permissions.md §4): nobody but the owner reads them, Admin and Faculty included, and a task of
// another kind (assignment, team) is never returned by these queries.

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

const T0 = new Date("2026-11-02T04:30:00Z");
const clock = (minutes: number) => setNowForTests(new Date(T0.getTime() + minutes * 60_000));

async function newUser(roleKey: string): Promise<CurrentUser> {
  const row = await insertUser(db, { status: "active", timezone: "Asia/Kolkata" });
  return asCurrentUser(row, roleKey);
}

function okData(result: { ok: boolean }): Record<string, unknown> {
  if (!result.ok) throw new Error(`Expected success, got ${JSON.stringify(result)}`);
  return (result as unknown as { data: Record<string, unknown> }).data;
}

async function makeTask(
  user: CurrentUser,
  title: string,
  extra: { deadlineDate?: string; steps?: string[] } = {},
) {
  return okData(
    await createTask(user, {
      title,
      description: null,
      category: "study",
      categoryOther: null,
      priority: "medium",
      deadlineDate: extra.deadlineDate ?? null,
      deadlineTime: null,
      estimateMinutes: null,
      steps: extra.steps ?? [],
    }),
  ).taskId as string;
}

const everyPermission = (): ReadonlySet<string> => new Set(PERMISSIONS.map((p) => p.key));

describe("listMyTasks", () => {
  it("shows only the user's own top-level, live tasks, soonest deadline first and no deadline last", async () => {
    const me = await newUser("student");
    const other = await newUser("student");
    clock(0);
    await makeTask(me, "No deadline, oldest");
    clock(1);
    await makeTask(me, "Due 20 Nov", { deadlineDate: "2026-11-20" });
    clock(2);
    await makeTask(me, "Due 10 Nov", { deadlineDate: "2026-11-10" });
    clock(3);
    await makeTask(me, "No deadline, newer");
    clock(4);
    const withSteps = await makeTask(me, "Has steps", { deadlineDate: "2026-11-30", steps: ["A", "B"] });
    clock(5);
    const gone = await makeTask(me, "Deleted one", { deadlineDate: "2026-11-01" });
    await deleteTask(me, { taskId: gone });
    await makeTask(other, "Someone else's");

    const list = await listMyTasks(me, "all");
    expect(list.map((t) => t.title)).toEqual([
      "Due 10 Nov",
      "Due 20 Nov",
      "Has steps",
      "No deadline, oldest",
      "No deadline, newer",
    ]);
    expect(list.find((t) => t.id === withSteps)).toMatchObject({ stepsTotal: 2, stepsDone: 0 });
  });

  it("counts steps done and total, ignoring deleted steps", async () => {
    const me = await newUser("student");
    clock(0);
    const id = await makeTask(me, "Parent", { steps: ["A", "B", "C"] });
    const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    clock(5);
    await completeTask(me, { taskId: steps[0].id, completeAllSteps: false });
    await deleteTask(me, { taskId: steps[1].id });

    const [item] = await listMyTasks(me, "all");
    expect(item).toMatchObject({ id, stepsTotal: 2, stepsDone: 1 });
  });

  it("the Open filter shows To Do and In progress, Done shows only Done, All shows both", async () => {
    const me = await newUser("student");
    clock(0);
    const todo = await makeTask(me, "Todo");
    const progress = await makeTask(me, "Progress");
    const finished = await makeTask(me, "Finished");
    clock(5);
    await startTask(me, { taskId: progress });
    await completeTask(me, { taskId: finished, completeAllSteps: false });

    expect((await listMyTasks(me, "open")).map((t) => t.id).sort()).toEqual([todo, progress].sort());
    expect((await listMyTasks(me, "done")).map((t) => t.id)).toEqual([finished]);
    expect(await listMyTasks(me, "all")).toHaveLength(3);
  });

  it("never lists an assignment or team task, even one assigned to the same student", async () => {
    const me = await newUser("student");
    const teacher = await insertUser(db, { status: "active" });
    await db.insert(tasks).values([
      {
        context: "assignment",
        createdBy: teacher.id,
        assigneeId: me.id,
        assignmentId: "55555555-5555-4555-8555-555555555555",
        title: "Lab report",
        category: "assignment",
        createdAt: T0,
        updatedAt: T0,
      },
      {
        context: "team",
        createdBy: me.id,
        assigneeId: me.id,
        teamId: "66666666-6666-4666-8666-666666666666",
        title: "Team poster",
        category: "project",
        createdAt: T0,
        updatedAt: T0,
      },
    ]);
    expect(await listMyTasks(me, "all")).toEqual([]);
  });
});

describe("getMyTask", () => {
  it("returns the task with its live steps, oldest first", async () => {
    const me = await newUser("student");
    clock(0);
    const id = await makeTask(me, "Parent", { steps: ["A"] });
    clock(5);
    const result = await createSubtask(me, {
      taskId: id,
      title: "B",
      deadlineDate: null,
      deadlineTime: null,
      estimateMinutes: null,
    });
    clock(6);
    await deleteTask(me, { taskId: okData(result).taskId as string });

    const detail = await getMyTask(me, id);
    expect(detail?.title).toBe("Parent");
    expect(detail?.steps.map((s) => s.title)).toEqual(["A"]);
    expect(detail?.parent).toBeNull();
  });

  it("a step names its parent", async () => {
    const me = await newUser("student");
    clock(0);
    const id = await makeTask(me, "Parent", { steps: ["A"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    expect((await getMyTask(me, step.id))?.parent).toEqual({ id, title: "Parent" });
  });

  it("returns a deleted task with its deletion time, so the screen can offer Restore", async () => {
    const me = await newUser("student");
    clock(0);
    const id = await makeTask(me, "Parent");
    clock(5);
    await deleteTask(me, { taskId: id });
    expect((await getMyTask(me, id))?.deletedAt).toEqual(new Date(T0.getTime() + 5 * 60_000));
  });

  it("another student's task is null", async () => {
    const me = await newUser("student");
    const other = await newUser("student");
    clock(0);
    const id = await makeTask(other, "Private");
    expect(await getMyTask(me, id)).toBeNull();
  });
});

describe("tier 1: nobody but the owner reads a personal task", () => {
  it("Admin opening a student's personal task: not found (even holding every permission key)", async () => {
    const student = await newUser("student");
    const admin = await newUser("admin");
    clock(0);
    const id = await makeTask(student, "Private diary", { steps: ["Secret step"] });

    expect(await getMyTask(admin, id)).toBeNull();
    expect(await listMyTasks(admin, "all")).toEqual([]);
    expect(await listMyDeletedTasks(admin)).toEqual([]);
    expect(await loadPersonalTask({ user: admin, permissions: everyPermission() }, id)).toBeNull();
    expect(await findTaskTarget(db as never, admin.id, id)).toBeNull();
  });

  it("Faculty opening a student's personal task: not found", async () => {
    const student = await newUser("student");
    const faculty = await newUser("faculty");
    clock(0);
    const id = await makeTask(student, "Private");
    expect(await getMyTask(faculty, id)).toBeNull();
    expect(await loadPersonalTask({ user: faculty, permissions: everyPermission() }, id)).toBeNull();
  });

  it("Admin reading the steps of an assignment task: not found", async () => {
    const student = await newUser("student");
    const admin = await newUser("admin");
    const teacher = await insertUser(db, { status: "active" });
    const [assignmentTask] = await db
      .insert(tasks)
      .values({
        context: "assignment",
        createdBy: teacher.id,
        assigneeId: student.id,
        assignmentId: "77777777-7777-4777-8777-777777777777",
        title: "Lab report",
        category: "assignment",
        createdAt: T0,
        updatedAt: T0,
      })
      .returning();
    const [assignmentStep] = await db
      .insert(tasks)
      .values({
        context: "assignment",
        createdBy: student.id,
        assigneeId: student.id,
        assignmentId: "77777777-7777-4777-8777-777777777777",
        parentTaskId: assignmentTask.id,
        title: "My private plan for the report",
        category: "assignment",
        createdAt: T0,
        updatedAt: T0,
      })
      .returning();

    for (const id of [assignmentTask.id, assignmentStep.id]) {
      expect(await getMyTask(admin, id)).toBeNull();
      expect(await loadPersonalTask({ user: admin, permissions: everyPermission() }, id)).toBeNull();
    }
    // The student's own personal-task screens do not show them either.
    expect(await getMyTask(student, assignmentTask.id)).toBeNull();
    expect(await getMyTask(student, assignmentStep.id)).toBeNull();
  });

  it("the policy file never looks at an Admin permission", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const file of ["policy.ts", "queries.ts", "commands.ts"]) {
      const source = readFileSync(resolve(__dirname, "../../src/server/tasks", file), "utf8");
      expect(source, file).not.toMatch(/admin\.override|adminMayRead|admin-access|roleKey/);
    }
  });
});

describe("listMyDeletedTasks", () => {
  it("lists the user's deleted tasks and steps, newest deletion first, with the parent of a step", async () => {
    const me = await newUser("student");
    const other = await newUser("student");
    clock(0);
    const parent = await makeTask(me, "Parent", { steps: ["Step A", "Step B"] });
    const alone = await makeTask(me, "Alone");
    const theirs = await makeTask(other, "Theirs");
    const [stepA] = await db.select().from(tasks).where(eq(tasks.parentTaskId, parent)).limit(1);
    clock(5);
    await deleteTask(me, { taskId: stepA.id });
    clock(10);
    await deleteTask(me, { taskId: alone });
    clock(15);
    await deleteTask(me, { taskId: parent });
    await deleteTask(other, { taskId: theirs });

    const list = await listMyDeletedTasks(me);
    expect(list.map((t) => t.title)).toEqual(["Parent", "Step B", "Alone", stepA.title]);
    const stepB = list.find((t) => t.title === "Step B");
    expect(stepB?.parent).toEqual({ id: parent, title: "Parent", deleted: true });
    expect(list.find((t) => t.id === stepA.id)?.parent?.deleted).toBe(true);
    expect(list.find((t) => t.title === "Alone")?.parent).toBeNull();
    expect(list.every((t) => t.title !== "Theirs")).toBe(true);
  });

  it("shows a step deleted on its own with a parent that is still live", async () => {
    const me = await newUser("student");
    clock(0);
    const parent = await makeTask(me, "Parent", { steps: ["Step A"] });
    const [step] = await db.select().from(tasks).where(eq(tasks.parentTaskId, parent));
    clock(5);
    await deleteTask(me, { taskId: step.id });
    const [item] = await listMyDeletedTasks(me);
    expect(item.parent).toEqual({ id: parent, title: "Parent", deleted: false });
  });
});

afterAll(() => resetNowForTests());
