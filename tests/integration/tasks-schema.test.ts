import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { taskEvents, tasks } from "@/server/db/schema";
import { insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// The database itself enforces the task rules from docs/data-model.md §4 (CHECKs, indexes, triggers),
// so a bug in the code cannot save a row that breaks them. Rows are inserted directly on purpose.

let db: TestDb;
let close: () => Promise<void>;
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  close = () => test.client.close();
  userId = (await insertUser(db)).id;
  otherUserId = (await insertUser(db)).id;
});

afterAll(async () => {
  await close();
});

const NOW = new Date("2026-11-02T10:00:00Z");
const EARLIER = new Date("2026-11-01T10:00:00Z");
// Rows are created at a fixed instant, as the commands do with the app clock (review A1).
const CREATED = new Date("2026-10-31T09:00:00Z");
type NewTask = typeof tasks.$inferInsert;

function personal(overrides: Partial<NewTask> = {}): NewTask {
  return {
    context: "personal",
    createdBy: userId,
    assigneeId: userId,
    title: "Read chapter 4",
    category: "study",
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

async function failureOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: Error }).cause;
    return `${(error as Error).message} ${cause?.message ?? ""}`;
  }
  return "";
}

async function expectRefused(values: NewTask, constraint: string) {
  const message = await failureOf(() => db.insert(tasks).values(values));
  expect(message).toContain(constraint);
}

const UUID_A = "11111111-1111-4111-8111-111111111111";

describe("tasks: defaults", () => {
  it("fills in the defaults from data-model.md §4", async () => {
    const [row] = await db.insert(tasks).values(personal()).returning();
    expect(row.status).toBe("todo");
    expect(row.priority).toBe("medium");
    expect(row.source).toBe("manual");
    expect(row.rescheduleCount).toBe(0);
    expect(row.parentTaskId).toBeNull();
    expect(row.deletedAt).toBeNull();
  });
});

describe("tasks: context shapes", () => {
  it("accepts a personal task", async () => {
    await expect(db.insert(tasks).values(personal())).resolves.toBeDefined();
  });

  it("refuses a personal task assigned to someone else", async () => {
    await expectRefused(personal({ assigneeId: otherUserId }), "tasks_context_shape");
  });

  it("refuses a personal task with no assignee", async () => {
    await expectRefused(personal({ assigneeId: null }), "tasks_context_shape");
  });

  it("refuses a personal task that points at an assignment or a team", async () => {
    await expectRefused(personal({ assignmentId: UUID_A }), "tasks_context_shape");
    await expectRefused(personal({ teamId: UUID_A }), "tasks_context_shape");
  });

  it("accepts an assignment task and refuses one missing its assignment or assignee", async () => {
    const assignmentTask = personal({
      context: "assignment",
      createdBy: otherUserId,
      assigneeId: userId,
      assignmentId: UUID_A,
      category: "assignment",
    });
    await expect(db.insert(tasks).values(assignmentTask)).resolves.toBeDefined();
    await expectRefused({ ...assignmentTask, assignmentId: null }, "tasks_context_shape");
    await expectRefused({ ...assignmentTask, assigneeId: null }, "tasks_context_shape");
    await expectRefused({ ...assignmentTask, teamId: UUID_A }, "tasks_context_shape");
  });

  it("accepts a team task with or without an assignee, and refuses one without a team", async () => {
    const teamTask = personal({ context: "team", teamId: UUID_A, assigneeId: null });
    await expect(db.insert(tasks).values(teamTask)).resolves.toBeDefined();
    await expect(db.insert(tasks).values({ ...teamTask, assigneeId: otherUserId })).resolves.toBeDefined();
    await expectRefused({ ...teamTask, teamId: null }, "tasks_context_shape");
    await expectRefused({ ...teamTask, assignmentId: UUID_A }, "tasks_context_shape");
  });
});

describe("tasks: status and timestamps", () => {
  it("done requires completed_at, and completed_at requires done", async () => {
    await expectRefused(personal({ status: "done" }), "tasks_done_has_completed_at");
    await expectRefused(personal({ status: "todo", completedAt: NOW }), "tasks_done_has_completed_at");
    await expectRefused(personal({ status: "in_progress", completedAt: NOW }), "tasks_done_has_completed_at");
    await expect(
      db.insert(tasks).values(personal({ status: "done", startedAt: EARLIER, completedAt: NOW })),
    ).resolves.toBeDefined();
  });

  it("started_at cannot be later than completed_at", async () => {
    await expectRefused(
      personal({ status: "done", startedAt: NOW, completedAt: EARLIER }),
      "tasks_started_before_completed",
    );
  });

  it("started_at equal to completed_at is allowed", async () => {
    await expect(
      db.insert(tasks).values(personal({ status: "done", startedAt: NOW, completedAt: NOW })),
    ).resolves.toBeDefined();
  });

  it("reschedule_count cannot be negative", async () => {
    await expectRefused(personal({ rescheduleCount: -1 }), "tasks_reschedule_count_not_negative");
  });
});

describe("tasks: category label", () => {
  it("category other needs a label, and any other category must not have one", async () => {
    await expectRefused(personal({ category: "other" }), "tasks_category_other_label");
    await expectRefused(personal({ category: "study", categoryOther: "Lab" }), "tasks_category_other_label");
    await expect(
      db.insert(tasks).values(personal({ category: "other", categoryOther: "Lab" })),
    ).resolves.toBeDefined();
  });
});

describe("tasks: clock agreement (review A1)", () => {
  it("started_at and completed_at cannot be before created_at", async () => {
    await expectRefused(personal({ startedAt: new Date("2026-10-30T09:00:00Z") }), "tasks_started_after_created");
    await expectRefused(
      personal({ status: "done", completedAt: new Date("2026-10-30T09:00:00Z") }),
      "tasks_completed_after_created",
    );
  });

  it("accepts a start or completion exactly at created_at", async () => {
    await expect(
      db.insert(tasks).values(personal({ status: "done", startedAt: CREATED, completedAt: CREATED })),
    ).resolves.toBeDefined();
  });
});

describe("tasks: deadlines and reasons", () => {
  it("a deadline needs original_deadline (review A4)", async () => {
    await expectRefused(personal({ deadline: NOW }), "tasks_deadline_has_original");
    await expect(
      db.insert(tasks).values(personal({ deadline: NOW, originalDeadline: EARLIER })),
    ).resolves.toBeDefined();
    await expect(db.insert(tasks).values(personal({ deadline: null }))).resolves.toBeDefined();
  });

  it("only assignment tasks have a resubmission window (review A3)", async () => {
    await expectRefused(personal({ resubmissionUntil: NOW }), "tasks_resubmission_only_assignment");
    await expect(
      db.insert(tasks).values(
        personal({
          context: "assignment",
          createdBy: otherUserId,
          assigneeId: userId,
          assignmentId: "33333333-3333-4333-8333-333333333333",
          category: "assignment",
          resubmissionUntil: NOW,
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("a personal task can only be deleted as user_deleted (review A6)", async () => {
    await expectRefused(
      personal({ deletedAt: NOW, deletedReason: "recipient_removed" }),
      "tasks_personal_delete_reason",
    );
    await expectRefused(
      personal({ deletedAt: NOW, deletedReason: "assignment_cancelled" }),
      "tasks_personal_delete_reason",
    );
  });
});

describe("tasks: blank text (review A5)", () => {
  it("refuses an empty or spaces-only title", async () => {
    await expectRefused(personal({ title: "" }), "tasks_title_not_blank");
    await expectRefused(personal({ title: "   " }), "tasks_title_not_blank");
  });

  it("refuses a blank custom category label", async () => {
    await expectRefused(personal({ category: "other", categoryOther: "  " }), "tasks_category_other_not_blank");
  });
});

describe("tasks: soft delete", () => {
  it("deleted_at and deleted_reason are set together", async () => {
    await expectRefused(personal({ deletedAt: NOW }), "tasks_deleted_pair");
    await expectRefused(personal({ deletedReason: "user_deleted" }), "tasks_deleted_pair");
    await expect(
      db.insert(tasks).values(personal({ deletedAt: NOW, deletedReason: "user_deleted" })),
    ).resolves.toBeDefined();
  });
});

describe("tasks: estimate", () => {
  it("accepts the limits and refuses outside them", async () => {
    const user = { estimateSource: "user" } as const;
    await expect(db.insert(tasks).values(personal({ estimateMinutes: 1, ...user }))).resolves.toBeDefined();
    await expect(db.insert(tasks).values(personal({ estimateMinutes: 6000, ...user }))).resolves.toBeDefined();
    await expectRefused(personal({ estimateMinutes: 0, ...user }), "tasks_estimate_in_range");
    await expectRefused(personal({ estimateMinutes: 6001, ...user }), "tasks_estimate_in_range");
  });

  it("an estimate and its source go together", async () => {
    await expectRefused(personal({ estimateMinutes: 30 }), "tasks_estimate_has_source");
    await expectRefused(personal({ estimateSource: "ai" }), "tasks_estimate_has_source");
    await expect(
      db.insert(tasks).values(personal({ estimateMinutes: 30, estimateSource: "ai" })),
    ).resolves.toBeDefined();
  });
});

describe("tasks: subtasks", () => {
  it("links to a parent, and a task cannot be its own parent", async () => {
    const [parent] = await db.insert(tasks).values(personal()).returning();
    await expect(
      db.insert(tasks).values(personal({ parentTaskId: parent.id, title: "Step 1" })),
    ).resolves.toBeDefined();
    const message = await failureOf(() =>
      db.update(tasks).set({ parentTaskId: parent.id }).where(eq(tasks.id, parent.id)),
    );
    expect(message).toContain("tasks_not_its_own_parent");
  });

  it("refuses a parent that does not exist", async () => {
    const message = await failureOf(() => db.insert(tasks).values(personal({ parentTaskId: UUID_A })));
    expect(message).toMatch(/foreign key|violates/i);
  });

  it("refuses to hard-delete a parent that has subtasks", async () => {
    const [parent] = await db.insert(tasks).values(personal()).returning();
    await db.insert(tasks).values(personal({ parentTaskId: parent.id, title: "Step 1" }));
    const message = await failureOf(() => db.delete(tasks).where(eq(tasks.id, parent.id)));
    expect(message).toMatch(/foreign key|violates/i);
  });
});

describe("tasks: one task per student per assignment", () => {
  it("refuses a second top-level task, but allows subtasks", async () => {
    const assignmentId = "22222222-2222-4222-8222-222222222222";
    const base = personal({
      context: "assignment",
      createdBy: otherUserId,
      assigneeId: userId,
      assignmentId,
      category: "assignment",
    });
    const [top] = await db.insert(tasks).values(base).returning();
    await expectRefused(base, "tasks_one_assignment_task_per_student");
    await expect(
      db.insert(tasks).values({ ...base, parentTaskId: top.id, title: "Step 1" }),
    ).resolves.toBeDefined();
    await expect(
      db.insert(tasks).values({ ...base, assigneeId: otherUserId }),
    ).resolves.toBeDefined();
  });

  it("does not limit personal tasks (no assignment id)", async () => {
    await db.insert(tasks).values(personal());
    await expect(db.insert(tasks).values(personal())).resolves.toBeDefined();
  });
});

describe("task_events is append-only", () => {
  let taskId: string;
  let eventId: string;

  beforeAll(async () => {
    const [task] = await db.insert(tasks).values(personal()).returning();
    taskId = task.id;
    const [event] = await db
      .insert(taskEvents)
      .values({ taskId, actorId: userId, eventType: "created" })
      .returning();
    eventId = event.id;
  });

  it("still accepts new rows", async () => {
    await expect(
      db
        .insert(taskEvents)
        .values({ taskId, actorId: userId, eventType: "status_changed", fromValue: "todo", toValue: "in_progress" }),
    ).resolves.toBeDefined();
  });

  it("refuses to change a row", async () => {
    const message = await failureOf(() =>
      db.update(taskEvents).set({ toValue: "x" }).where(eq(taskEvents.id, eventId)),
    );
    expect(message).toMatch(/append-only/i);
    expect(message).toContain("task_events");
  });

  it("refuses to delete a row", async () => {
    const message = await failureOf(() => db.delete(taskEvents).where(eq(taskEvents.id, eventId)));
    expect(message).toMatch(/append-only/i);
    expect(await db.select().from(taskEvents).where(eq(taskEvents.id, eventId))).toHaveLength(1);
  });

  it("refuses to delete every row, and refuses TRUNCATE", async () => {
    expect(await failureOf(() => db.delete(taskEvents))).toMatch(/append-only/i);
    expect(await failureOf(() => db.execute(sql`truncate table task_events`))).toMatch(/append-only/i);
    expect((await db.select().from(taskEvents)).length).toBeGreaterThan(0);
  });

  it("refuses an event for a task that does not exist", async () => {
    const message = await failureOf(() =>
      db.insert(taskEvents).values({ taskId: UUID_A, actorId: userId, eventType: "created" }),
    );
    expect(message).toMatch(/foreign key|violates/i);
  });
});
