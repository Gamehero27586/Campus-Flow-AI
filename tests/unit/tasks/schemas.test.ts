import { describe, expect, it } from "vitest";
import {
  MAX_SUBTASKS_PER_TASK,
  TASK_CATEGORY_OTHER_MAX_LENGTH,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_TITLE_MAX_LENGTH,
} from "@/config/limits";
import {
  backfillStartSchema,
  changeDeadlineSchema,
  completeTaskSchema,
  createSubtaskSchema,
  createTaskSchema,
  reopenTaskSchema,
  updateTaskSchema,
} from "@/lib/schemas/tasks";

// What a task form may send, and the field messages for what it may not (docs/slices/slice-3-plan.md R-i,
// docs/reviews/slice-3b-opus-review.md §4 item 2).

const ID = "11111111-1111-4111-8111-111111111111";

const valid = {
  title: "Read chapter 4",
  description: "",
  category: "study",
  categoryOther: "",
  priority: "",
  deadlineDate: "",
  deadlineTime: "",
  estimateMinutes: "",
  steps: [] as string[],
};

function errorsOf(schema: { safeParse: (value: unknown) => { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) return null;
  return Object.fromEntries(result.error!.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

describe("createTaskSchema", () => {
  it("accepts a minimal form: blanks become null and the priority defaults to medium", () => {
    const parsed = createTaskSchema.parse(valid);
    expect(parsed).toMatchObject({
      title: "Read chapter 4",
      description: null,
      categoryOther: null,
      priority: "medium",
      deadlineDate: null,
      deadlineTime: null,
      estimateMinutes: null,
      steps: [],
    });
  });

  it("trims the title and refuses an empty or spaces-only one", () => {
    expect(createTaskSchema.parse({ ...valid, title: "  Read  " }).title).toBe("Read");
    expect(errorsOf(createTaskSchema, { ...valid, title: "   " })).toEqual({ title: "Enter a title." });
    expect(errorsOf(createTaskSchema, { ...valid, title: null })).toEqual({ title: "Enter a title." });
  });

  it("R-i: the title, description and custom label have maximum lengths", () => {
    expect(createTaskSchema.safeParse({ ...valid, title: "a".repeat(TASK_TITLE_MAX_LENGTH) }).success).toBe(true);
    expect(errorsOf(createTaskSchema, { ...valid, title: "a".repeat(TASK_TITLE_MAX_LENGTH + 1) })?.title).toMatch(
      /at most 200/,
    );
    expect(
      createTaskSchema.safeParse({ ...valid, description: "a".repeat(TASK_DESCRIPTION_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      errorsOf(createTaskSchema, { ...valid, description: "a".repeat(TASK_DESCRIPTION_MAX_LENGTH + 1) })?.description,
    ).toMatch(/at most 5000/);
    expect(
      errorsOf(createTaskSchema, {
        ...valid,
        category: "other",
        categoryOther: "a".repeat(TASK_CATEGORY_OTHER_MAX_LENGTH + 1),
      })?.categoryOther,
    ).toMatch(/at most 40/);
  });

  it("category Other needs a label; any other category drops a label that was sent", () => {
    expect(errorsOf(createTaskSchema, { ...valid, category: "other" })).toEqual({
      categoryOther: "Name the category.",
    });
    expect(createTaskSchema.parse({ ...valid, category: "other", categoryOther: " Lab " }).categoryOther).toBe(
      "Lab",
    );
    expect(createTaskSchema.parse({ ...valid, category: "study", categoryOther: "Lab" }).categoryOther).toBeNull();
    expect(errorsOf(createTaskSchema, { ...valid, category: "cooking" })?.category).toBe("Choose a category.");
  });

  it("R-i: the estimate is a whole number of minutes from 1 to 6000", () => {
    expect(createTaskSchema.parse({ ...valid, estimateMinutes: "90" }).estimateMinutes).toBe(90);
    expect(createTaskSchema.parse({ ...valid, estimateMinutes: "1" }).estimateMinutes).toBe(1);
    expect(
      createTaskSchema.parse({ ...valid, estimateMinutes: String(TASK_ESTIMATE_MAX_MINUTES) }).estimateMinutes,
    ).toBe(6000);
    for (const bad of ["0", "-5", "6001", "1.5", "abc"]) {
      expect(errorsOf(createTaskSchema, { ...valid, estimateMinutes: bad })?.estimateMinutes, bad).toBeDefined();
    }
  });

  it("R-i: at most 30 steps, blank steps dropped, each with the title limit", () => {
    const thirty = Array.from({ length: MAX_SUBTASKS_PER_TASK }, (_, i) => `Step ${i}`);
    expect(createTaskSchema.parse({ ...valid, steps: thirty }).steps).toHaveLength(30);
    expect(errorsOf(createTaskSchema, { ...valid, steps: [...thirty, "One more"] })?.steps).toMatch(/at most 30/);
    expect(createTaskSchema.parse({ ...valid, steps: ["A", "", "  ", "B"] }).steps).toEqual(["A", "B"]);
    expect(errorsOf(createTaskSchema, { ...valid, steps: ["a".repeat(201)] })?.steps).toMatch(/at most 200/);
  });

  describe("deadline", () => {
    it("accepts a date, with or without a time", () => {
      expect(createTaskSchema.parse({ ...valid, deadlineDate: "2026-11-10" })).toMatchObject({
        deadlineDate: "2026-11-10",
        deadlineTime: null,
      });
      expect(createTaskSchema.parse({ ...valid, deadlineDate: "2026-11-10", deadlineTime: "17:30" })).toMatchObject({
        deadlineTime: "17:30",
      });
    });

    it("refuses a time without a date", () => {
      expect(errorsOf(createTaskSchema, { ...valid, deadlineTime: "17:30" })).toEqual({
        deadlineDate: "Choose a date for that time.",
      });
    });

    it("refuses dates that do not exist and times that are not times", () => {
      expect(errorsOf(createTaskSchema, { ...valid, deadlineDate: "2026-02-30" })?.deadlineDate).toBe(
        "Choose a valid date.",
      );
      expect(errorsOf(createTaskSchema, { ...valid, deadlineDate: "10/11/2026" })?.deadlineDate).toBe(
        "Choose a valid date.",
      );
      expect(
        errorsOf(createTaskSchema, { ...valid, deadlineDate: "2026-11-10", deadlineTime: "25:00" })?.deadlineTime,
      ).toBe("Choose a valid time.");
    });

    it("refuses a mistyped year with a field message (20266, 0202, 1999, 2101)", () => {
      for (const date of ["20266-11-10", "0202-11-10", "1999-12-31", "2101-01-01"]) {
        expect(errorsOf(createTaskSchema, { ...valid, deadlineDate: date })?.deadlineDate, date).toMatch(
          /valid date|between the years 2000 and 2100/,
        );
      }
      expect(errorsOf(createTaskSchema, { ...valid, deadlineDate: "1999-12-31" })?.deadlineDate).toBe(
        "Choose a date between the years 2000 and 2100.",
      );
    });

    it("accepts the first and last day of the range", () => {
      expect(createTaskSchema.safeParse({ ...valid, deadlineDate: "2000-01-01" }).success).toBe(true);
      expect(createTaskSchema.safeParse({ ...valid, deadlineDate: "2100-12-31" }).success).toBe(true);
    });
  });
});

describe("the other forms", () => {
  it("every task action needs a real task id", () => {
    expect(updateTaskSchema.safeParse({ ...valid, taskId: "not-an-id" }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ ...valid, taskId: ID }).success).toBe(true);
    expect(reopenTaskSchema.safeParse({ taskId: "" }).success).toBe(false);
  });

  it("changeDeadline needs a date (a deadline cannot be removed) and applies the year range", () => {
    expect(changeDeadlineSchema.safeParse({ taskId: ID, deadlineDate: "", deadlineTime: "" }).success).toBe(false);
    expect(changeDeadlineSchema.safeParse({ taskId: ID, deadlineDate: "20266-01-01", deadlineTime: "" }).success).toBe(
      false,
    );
    expect(changeDeadlineSchema.parse({ taskId: ID, deadlineDate: "2026-11-10", deadlineTime: "" })).toEqual({
      taskId: ID,
      deadlineDate: "2026-11-10",
      deadlineTime: null,
    });
  });

  it("createSubtask takes a title, an optional deadline and an optional estimate", () => {
    expect(
      createSubtaskSchema.parse({ taskId: ID, title: "Draft", deadlineDate: "", deadlineTime: "", estimateMinutes: "20" }),
    ).toMatchObject({ title: "Draft", deadlineDate: null, estimateMinutes: 20 });
    expect(
      createSubtaskSchema.safeParse({ taskId: ID, title: "", deadlineDate: "", deadlineTime: "", estimateMinutes: "" })
        .success,
    ).toBe(false);
  });

  it("completeTask reads the 'complete all' checkbox", () => {
    expect(completeTaskSchema.parse({ taskId: ID, completeAllSteps: "on" }).completeAllSteps).toBe(true);
    expect(completeTaskSchema.parse({ taskId: ID, completeAllSteps: null }).completeAllSteps).toBe(false);
  });

  it("reopen goes to In progress unless To Do is chosen, and nothing else", () => {
    expect(reopenTaskSchema.parse({ taskId: ID, to: null }).to).toBe("in_progress");
    expect(reopenTaskSchema.parse({ taskId: ID, to: "todo" }).to).toBe("todo");
    expect(reopenTaskSchema.safeParse({ taskId: ID, to: "done" }).success).toBe(false);
  });

  it("backfillStart needs both a date and a time, in range", () => {
    expect(backfillStartSchema.safeParse({ taskId: ID, startDate: "2026-11-02", startTime: "" }).success).toBe(false);
    expect(backfillStartSchema.safeParse({ taskId: ID, startDate: "0202-11-02", startTime: "10:00" }).success).toBe(
      false,
    );
    expect(backfillStartSchema.safeParse({ taskId: ID, startDate: "2026-11-02", startTime: "10:00" }).success).toBe(
      true,
    );
  });
});
