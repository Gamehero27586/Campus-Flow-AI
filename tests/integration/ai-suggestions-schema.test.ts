import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_FEEDBACK_MAX_LENGTH } from "@/config/limits";
import { aiSuggestions, tasks } from "@/server/db/schema";
import { insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// The database itself enforces the AI rules from docs/data-model.md §8 and docs/slices/slice-4-plan.md 4b, so a
// bug in the code cannot save a row that breaks them. Rows are inserted directly on purpose.

let db: TestDb;
let close: () => Promise<void>;
let userId: string;
let taskId: string;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  close = () => test.client.close();
  userId = (await insertUser(db)).id;
  const [task] = await db
    .insert(tasks)
    .values({ context: "personal", createdBy: userId, assigneeId: userId, title: "Write the report", category: "study" })
    .returning();
  taskId = task.id;
});

afterAll(async () => {
  await close();
});

const CREATED = new Date("2026-11-02T09:00:00Z");
const RESOLVED = new Date("2026-11-02T09:00:05Z");
type NewSuggestion = typeof aiSuggestions.$inferInsert;
type NewTask = typeof tasks.$inferInsert;

function breakdown(overrides: Partial<NewSuggestion> = {}): NewSuggestion {
  return {
    userId,
    taskId,
    kind: "breakdown",
    model: "llama3.2:3b",
    promptVersion: "breakdown.v1",
    inputSnapshot: { title: "Write the report" },
    createdAt: CREATED,
    ...overrides,
  };
}

/** A breakdown the student saved (edited, so 4 of the 5 suggested steps were kept). */
function saved(overrides: Partial<NewSuggestion> = {}): NewSuggestion {
  return breakdown({
    outcome: "edited",
    outputValid: true,
    resolvedAt: RESOLVED,
    itemsSuggested: 5,
    itemsKept: 4,
    ...overrides,
  });
}

function summary(overrides: Partial<NewSuggestion> = {}): NewSuggestion {
  return {
    userId,
    kind: "summary",
    timeframe: "week",
    timeframeStart: "2026-10-26",
    model: "llama3.2:3b",
    promptVersion: "summary.v1",
    inputSnapshot: {},
    createdAt: CREATED,
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

async function expectRefused(values: NewSuggestion, constraint: string) {
  expect(await failureOf(() => db.insert(aiSuggestions).values(values))).toContain(constraint);
}

describe("ai_suggestions: defaults", () => {
  it("a new breakdown is pending, not valid, with nothing resolved", async () => {
    const [row] = await db.insert(aiSuggestions).values(breakdown()).returning();
    expect(row.outcome).toBe("pending");
    expect(row.outputValid).toBe(false);
    expect(row.resolvedAt).toBeNull();
    expect(row.rating).toBeNull();
    expect(row.itemsKept).toBeNull();
  });

  it("keeps the input snapshot as JSON", async () => {
    const snapshot = { title: "Read", existingSteps: ["A", "B"], today: "2026-11-02" };
    const [row] = await db.insert(aiSuggestions).values(breakdown({ inputSnapshot: snapshot })).returning();
    expect(row.inputSnapshot).toEqual(snapshot);
  });

  it("refuses a row without model, prompt version or input snapshot", async () => {
    for (const missing of ["model", "promptVersion", "inputSnapshot"] as const) {
      const values = { ...breakdown(), [missing]: undefined } as NewSuggestion;
      expect(await failureOf(() => db.insert(aiSuggestions).values(values)), missing).not.toBe("");
    }
  });
});

describe("ai_suggestions: breakdown and summary shapes", () => {
  it("accepts a summary with a timeframe and its first day", async () => {
    await expect(db.insert(aiSuggestions).values(summary())).resolves.toBeDefined();
    await expect(
      db.insert(aiSuggestions).values(summary({ timeframe: "month", timeframeStart: "2026-10-01" })),
    ).resolves.toBeDefined();
  });

  it("refuses a breakdown without a task", async () => {
    await expectRefused(breakdown({ taskId: null }), "ai_suggestions_kind_shape");
  });

  it("refuses a breakdown that has a timeframe or a timeframe start", async () => {
    await expectRefused(breakdown({ timeframe: "week" }), "ai_suggestions_kind_shape");
    await expectRefused(breakdown({ timeframeStart: "2026-10-26" }), "ai_suggestions_kind_shape");
  });

  it("refuses a summary missing its timeframe or its first day", async () => {
    await expectRefused(summary({ timeframe: null }), "ai_suggestions_kind_shape");
    await expectRefused(summary({ timeframeStart: null }), "ai_suggestions_kind_shape");
  });

  it("refuses a summary that belongs to one task (B1)", async () => {
    await expectRefused(summary({ taskId }), "ai_suggestions_kind_shape");
  });
});

describe("ai_suggestions: rating", () => {
  it("accepts 1 to 5 and no rating", async () => {
    for (const rating of [1, 3, 5, null]) {
      await expect(db.insert(aiSuggestions).values(saved({ rating })), String(rating)).resolves.toBeDefined();
    }
  });

  it("refuses 0, 6 and negative ratings", async () => {
    for (const rating of [0, 6, -1]) await expectRefused(saved({ rating }), "ai_suggestions_rating_range");
  });
});

describe("ai_suggestions: pending and resolved go together", () => {
  it("a pending row has no resolved_at", async () => {
    await expectRefused(breakdown({ outcome: "pending", resolvedAt: RESOLVED }), "ai_suggestions_resolved_pair");
  });

  it("every other outcome has a resolved_at", async () => {
    for (const outcome of ["accepted", "edited", "discarded", "failed"] as const) {
      const outputValid = outcome !== "failed";
      await expectRefused(breakdown({ outcome, outputValid }), "ai_suggestions_resolved_pair");
      await expect(
        db.insert(aiSuggestions).values(breakdown({ outcome, outputValid, resolvedAt: RESOLVED })),
        outcome,
      ).resolves.toBeDefined();
    }
  });

  it("resolved_at cannot be earlier than created_at", async () => {
    await expectRefused(
      breakdown({ outcome: "discarded", resolvedAt: new Date("2026-11-02T08:59:59Z") }),
      "ai_suggestions_resolved_after_created",
    );
  });
});

describe("ai_suggestions: failed means the answer was not valid", () => {
  it("refuses a failed suggestion marked valid", async () => {
    await expectRefused(
      breakdown({ outcome: "failed", outputValid: true, resolvedAt: RESOLVED }),
      "ai_suggestions_failed_not_valid",
    );
  });

  it("accepts a failed suggestion marked not valid, and a valid pending one", async () => {
    await expect(
      db.insert(aiSuggestions).values(breakdown({ outcome: "failed", outputValid: false, resolvedAt: RESOLVED })),
    ).resolves.toBeDefined();
    await expect(db.insert(aiSuggestions).values(breakdown({ outputValid: true }))).resolves.toBeDefined();
  });
});

describe("ai_suggestions: only a valid answer can be saved (B2)", () => {
  it("refuses an accepted or edited suggestion whose answer was not valid", async () => {
    for (const outcome of ["accepted", "edited"] as const) {
      // itemsKept 5 of 5, so "accepted" does not trip its own all-kept rule first.
      await expectRefused(saved({ outcome, outputValid: false, itemsKept: 5 }), "ai_suggestions_saved_is_valid");
    }
  });

  it("accepts a saved suggestion whose answer was valid, and a discarded one either way", async () => {
    await expect(db.insert(aiSuggestions).values(saved())).resolves.toBeDefined();
    for (const outputValid of [true, false]) {
      await expect(
        db.insert(aiSuggestions).values(breakdown({ outcome: "discarded", outputValid, resolvedAt: RESOLVED })),
      ).resolves.toBeDefined();
    }
  });
});

describe("ai_suggestions: numbers", () => {
  it("latency cannot be negative", async () => {
    await expectRefused(breakdown({ latencyMs: -1 }), "ai_suggestions_latency_not_negative");
    await expect(db.insert(aiSuggestions).values(breakdown({ latencyMs: 0 }))).resolves.toBeDefined();
  });

  it("item counts cannot be negative", async () => {
    await expectRefused(breakdown({ itemsSuggested: -1 }), "ai_suggestions_items_not_negative");
    await expectRefused(saved({ itemsKept: -1 }), "ai_suggestions_items_not_negative");
  });

  it("items_kept cannot be more than items_suggested when both are set", async () => {
    await expectRefused(saved({ itemsSuggested: 5, itemsKept: 6 }), "ai_suggestions_kept_within_suggested");
    for (const [suggested, kept] of [
      [5, 5],
      [5, 0],
      [5, null],
      [null, 3],
      [null, null],
    ] as const) {
      await expect(
        db.insert(aiSuggestions).values(saved({ itemsSuggested: suggested, itemsKept: kept })),
        `${suggested}/${kept}`,
      ).resolves.toBeDefined();
    }
  });
});

describe("ai_suggestions: items are kept only when steps were saved (B3, AI-f and AI-g)", () => {
  it("refuses items_kept on a pending, discarded or failed suggestion", async () => {
    await expectRefused(breakdown({ itemsSuggested: 5, itemsKept: 2 }), "ai_suggestions_kept_only_when_saved");
    await expectRefused(
      breakdown({ outcome: "discarded", resolvedAt: RESOLVED, itemsSuggested: 5, itemsKept: 0 }),
      "ai_suggestions_kept_only_when_saved",
    );
    await expectRefused(
      breakdown({ outcome: "failed", outputValid: false, resolvedAt: RESOLVED, itemsKept: 0 }),
      "ai_suggestions_kept_only_when_saved",
    );
  });

  it("allows those outcomes without items_kept, and an edited suggestion with any count up to the total", async () => {
    await expect(
      db.insert(aiSuggestions).values(breakdown({ outcome: "discarded", resolvedAt: RESOLVED, itemsSuggested: 5 })),
    ).resolves.toBeDefined();
    await expect(db.insert(aiSuggestions).values(saved({ itemsKept: 0 }))).resolves.toBeDefined();
    await expect(db.insert(aiSuggestions).values(saved({ itemsKept: 5 }))).resolves.toBeDefined();
  });

  it("accepted means everything suggested was kept", async () => {
    await expectRefused(
      saved({ outcome: "accepted", itemsSuggested: 5, itemsKept: 4 }),
      "ai_suggestions_accepted_kept_all",
    );
    await expect(
      db.insert(aiSuggestions).values(saved({ outcome: "accepted", itemsSuggested: 5, itemsKept: 5 })),
    ).resolves.toBeDefined();
  });
});

describe("ai_suggestions: rating and comment come after saving (B4, AI-h)", () => {
  it("refuses a rating or a comment on a pending, discarded or failed suggestion", async () => {
    await expectRefused(breakdown({ rating: 4 }), "ai_suggestions_feedback_after_saving");
    await expectRefused(breakdown({ feedbackText: "Useful" }), "ai_suggestions_feedback_after_saving");
    await expectRefused(
      breakdown({ outcome: "discarded", resolvedAt: RESOLVED, rating: 2 }),
      "ai_suggestions_feedback_after_saving",
    );
    await expectRefused(
      breakdown({ outcome: "failed", outputValid: false, resolvedAt: RESOLVED, feedbackText: "Broken" }),
      "ai_suggestions_feedback_after_saving",
    );
  });

  it("accepts a rating, a comment or both on an accepted or edited suggestion", async () => {
    await expect(db.insert(aiSuggestions).values(saved({ rating: 4 }))).resolves.toBeDefined();
    await expect(db.insert(aiSuggestions).values(saved({ feedbackText: "Good start" }))).resolves.toBeDefined();
    await expect(
      db
        .insert(aiSuggestions)
        .values(saved({ outcome: "accepted", itemsKept: 5, rating: 5, feedbackText: "Saved me time" })),
    ).resolves.toBeDefined();
  });
});

describe("ai_suggestions: feedback text", () => {
  it("accepts exactly the limit and refuses one character more", async () => {
    await expect(
      db.insert(aiSuggestions).values(saved({ feedbackText: "a".repeat(AI_FEEDBACK_MAX_LENGTH) })),
    ).resolves.toBeDefined();
    await expectRefused(
      saved({ feedbackText: "a".repeat(AI_FEEDBACK_MAX_LENGTH + 1) }),
      "ai_suggestions_feedback_length",
    );
  });

  it("refuses an empty or blank comment (B5)", async () => {
    // btrim removes spaces only (the same rule as task titles); the 4c form schema trims every kind of whitespace.
    for (const blank of ["", " ", "   "]) {
      await expectRefused(saved({ feedbackText: blank }), "ai_suggestions_feedback_not_blank");
    }
    await expect(db.insert(aiSuggestions).values(saved({ feedbackText: " ok " }))).resolves.toBeDefined();
  });
});

describe("ai_suggestions: foreign keys and indexes", () => {
  it("refuses an unknown user or an unknown task", async () => {
    const unknown = "11111111-1111-4111-8111-111111111111";
    expect(await failureOf(() => db.insert(aiSuggestions).values(breakdown({ userId: unknown })))).toContain(
      "ai_suggestions_user_id_users_id_fk",
    );
    expect(await failureOf(() => db.insert(aiSuggestions).values(breakdown({ taskId: unknown })))).toContain(
      "ai_suggestions_task_id_tasks_id_fk",
    );
  });

  it("has the two indexes from the plan", async () => {
    const result = await db.execute(sql`select indexname from pg_indexes where tablename = 'ai_suggestions'`);
    const names = result.rows.map((row) => (row as { indexname: string }).indexname);
    expect(names).toEqual(
      expect.arrayContaining(["ai_suggestions_user_kind_created_idx", "ai_suggestions_task_idx"]),
    );
  });
});

describe("tasks: source and ai_suggestion_id go together (Slice 4)", () => {
  function step(overrides: Partial<NewTask> = {}): NewTask {
    return {
      context: "personal",
      createdBy: userId,
      assigneeId: userId,
      parentTaskId: taskId,
      title: "Collect the readings",
      category: "study",
      ...overrides,
    };
  }

  it("a manual task has no suggestion (all existing rows are like this)", async () => {
    await expect(db.insert(tasks).values(step())).resolves.toBeDefined();
  });

  it("an AI step needs a suggestion, and points at a real one", async () => {
    const [suggestion] = await db.insert(aiSuggestions).values(breakdown()).returning();
    await expect(
      db.insert(tasks).values(step({ source: "ai_breakdown", aiSuggestionId: suggestion.id })),
    ).resolves.toBeDefined();

    expect(await failureOf(() => db.insert(tasks).values(step({ source: "ai_breakdown" })))).toContain(
      "tasks_source_matches_suggestion",
    );
  });

  it("a manual task cannot carry a suggestion", async () => {
    const [suggestion] = await db.insert(aiSuggestions).values(breakdown()).returning();
    expect(
      await failureOf(() => db.insert(tasks).values(step({ source: "manual", aiSuggestionId: suggestion.id }))),
    ).toContain("tasks_source_matches_suggestion");
  });

  it("an AI step cannot point at a suggestion that does not exist", async () => {
    expect(
      await failureOf(() =>
        db
          .insert(tasks)
          .values(step({ source: "ai_breakdown", aiSuggestionId: "22222222-2222-4222-8222-222222222222" })),
      ),
    ).toContain("tasks_ai_suggestion_id_ai_suggestions_id_fk");
  });

  it("a suggestion that steps point at cannot be deleted", async () => {
    const [suggestion] = await db.insert(aiSuggestions).values(breakdown()).returning();
    await db.insert(tasks).values(step({ source: "ai_breakdown", aiSuggestionId: suggestion.id }));
    expect(await failureOf(() => db.execute(sql`delete from ai_suggestions where id = ${suggestion.id}`))).toContain(
      "tasks_ai_suggestion_id_ai_suggestions_id_fk",
    );
  });
});
