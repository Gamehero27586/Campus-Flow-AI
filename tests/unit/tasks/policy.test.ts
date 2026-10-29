import { describe, expect, it } from "vitest";
import { MAX_SUBTASKS_PER_TASK } from "@/config/limits";
import { runRules } from "@/server/policies/evaluate-record";
import {
  addSubtaskRules,
  backfillStartRules,
  changeDeadlineRules,
  completeRules,
  deleteRules,
  moveBackToTodoRules,
  reopenRules,
  restoreRules,
  startRules,
  type TaskTarget,
  updateSubtaskRules,
  updateTaskRules,
} from "@/server/tasks/policy";
import { actor, defaultKeysFor, makeUser } from "../../helpers/permission-harness";

// A table for src/server/tasks/policy.ts: every refusal code and every allowed case, one row each.
// (The commands call the same rules again on the locked row; tests/integration/tasks-commands.test.ts
// shows the rules inside real transactions.)

const OWNER_ID = "00000000-0000-4000-8000-0000000000aa";
const owner = makeUser({ id: OWNER_ID });
const T0 = new Date("2026-11-02T04:30:00Z");
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function task(overrides: Partial<TaskTarget> = {}): TaskTarget {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    context: "personal",
    assigneeId: OWNER_ID,
    createdAt: T0,
    parentTaskId: null,
    title: "Read chapter 4",
    category: "study",
    categoryOther: null,
    priority: "medium",
    status: "todo",
    deadline: null,
    originalDeadline: null,
    rescheduleCount: 0,
    estimateMinutes: null,
    estimateSource: null,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    parent: null,
    stepCount: 0,
    openStepCount: 0,
    ...overrides,
  };
}

const step = (overrides: Partial<TaskTarget> = {}) =>
  task({
    parentTaskId: "00000000-0000-4000-8000-000000000100",
    parent: {
      id: "00000000-0000-4000-8000-000000000100",
      status: "todo",
      startedAt: null,
      deletedAt: null,
    },
    ...overrides,
  });

const done = { status: "done", startedAt: later(10), completedAt: later(60) } as const;
const deleted = { deletedAt: later(5) };

type Rules = ReturnType<typeof startRules>;

/** "allow", or the refusal's code. */
function verdict(rules: Rules, record: TaskTarget, user = owner): string {
  const decision = runRules(rules, { user, permissions: defaultKeysFor("student"), record });
  return decision.allow ? "allow" : decision.code;
}

type Row = [name: string, rules: Rules, record: TaskTarget, expected: string];

const rows: Row[] = [
  // ---- start
  ["start: To Do task", startRules(), task(), "allow"],
  ["start: a To Do step", startRules(), step(), "allow"],
  ["start: already in progress", startRules(), task({ status: "in_progress" }), "already_started"],
  ["start: Done", startRules(), task(done), "task_done"],
  ["start: deleted", startRules(), task(deleted), "task_deleted"],

  // ---- move back to To Do
  ["move back: in progress", moveBackToTodoRules(), task({ status: "in_progress" }), "allow"],
  ["move back: To Do", moveBackToTodoRules(), task(), "not_in_progress"],
  ["move back: Done", moveBackToTodoRules(), task(done), "not_in_progress"],
  ["move back: deleted", moveBackToTodoRules(), task({ ...deleted, status: "in_progress" }), "task_deleted"],

  // ---- complete
  ["complete: no steps", completeRules(false), task({ status: "in_progress" }), "allow"],
  ["complete: To Do straight to Done", completeRules(false), task(), "allow"],
  ["complete: all steps done", completeRules(false), task({ stepCount: 2, openStepCount: 0 }), "allow"],
  ["complete: open steps, no choice", completeRules(false), task({ stepCount: 2, openStepCount: 2 }), "open_steps"],
  ["complete: open steps, complete all", completeRules(true), task({ stepCount: 2, openStepCount: 2 }), "allow"],
  ["complete: already Done", completeRules(false), task(done), "already_done"],
  ["complete: a step", completeRules(false), step(), "allow"],
  ["complete: deleted", completeRules(false), task(deleted), "task_deleted"],

  // ---- reopen (R-c)
  ["reopen: Done", reopenRules(), task(done), "allow"],
  ["reopen: not Done", reopenRules(), task({ status: "in_progress" }), "not_done"],
  ["reopen: step of a To Do parent", reopenRules(), step(done), "allow"],
  [
    "reopen: step of a Done parent (R-c)",
    reopenRules(),
    step({
      ...done,
      parent: { id: "p", status: "done", startedAt: later(1), deletedAt: null },
    }),
    "parent_done",
  ],
  ["reopen: deleted", reopenRules(), task({ ...done, ...deleted }), "task_deleted"],

  // ---- backfill start
  ["backfill: Done without a start", backfillStartRules(null), task({ status: "done", completedAt: later(60) }), "allow"],
  ["backfill: not Done", backfillStartRules(null), task(), "not_done"],
  ["backfill: start already set", backfillStartRules(null), task(done), "start_already_set"],
  ["backfill: deleted", backfillStartRules(null), task({ status: "done", completedAt: later(60), ...deleted }), "task_deleted"],
  [
    "backfill: at creation",
    backfillStartRules({ startedAt: T0, now: later(120) }),
    task({ status: "done", completedAt: later(60) }),
    "allow",
  ],
  [
    "backfill: at completion",
    backfillStartRules({ startedAt: later(60), now: later(120) }),
    task({ status: "done", completedAt: later(60) }),
    "allow",
  ],
  [
    "backfill: before creation",
    backfillStartRules({ startedAt: later(-1), now: later(120) }),
    task({ status: "done", completedAt: later(60) }),
    "start_too_early",
  ],
  [
    "backfill: after completion",
    backfillStartRules({ startedAt: later(61), now: later(120) }),
    task({ status: "done", completedAt: later(60) }),
    "start_after_finish",
  ],
  [
    "backfill: in the future",
    backfillStartRules({ startedAt: later(130), now: later(120) }),
    task({ status: "done", completedAt: later(200) }),
    "start_in_future",
  ],

  // ---- edit and deadline
  ["update task: top-level", updateTaskRules(), task(), "allow"],
  ["update task: Done is editable", updateTaskRules(), task(done), "allow"],
  ["update task: a step", updateTaskRules(), step(), "is_step"],
  ["update task: deleted", updateTaskRules(), task(deleted), "task_deleted"],
  ["update step: a step", updateSubtaskRules(), step(), "allow"],
  ["update step: a top-level task", updateSubtaskRules(), task(), "not_a_step"],
  ["update step: deleted", updateSubtaskRules(), step(deleted), "task_deleted"],
  ["change deadline: open", changeDeadlineRules(), task(), "allow"],
  ["change deadline: a step", changeDeadlineRules(), step(), "allow"],
  ["change deadline: deleted", changeDeadlineRules(), task(deleted), "task_deleted"],
  ["change deadline: in progress", changeDeadlineRules(), task({ status: "in_progress" }), "allow"],
  ["change deadline: Done (C1)", changeDeadlineRules(), task(done), "task_done"],
  ["change deadline: a Done step (C1)", changeDeadlineRules(), step(done), "task_done"],

  // ---- add a step (the record is the parent): R-b and the limit
  ["add step: To Do parent", addSubtaskRules(), task(), "allow"],
  ["add step: in progress parent", addSubtaskRules(), task({ status: "in_progress" }), "allow"],
  ["add step: Done parent (R-b)", addSubtaskRules(), task(done), "parent_done"],
  ["add step: to a step", addSubtaskRules(), step(), "step_of_step"],
  ["add step: deleted parent", addSubtaskRules(), task(deleted), "task_deleted"],
  [
    "add step: one below the limit",
    addSubtaskRules(),
    task({ stepCount: MAX_SUBTASKS_PER_TASK - 1 }),
    "allow",
  ],
  [
    "add step: at the limit",
    addSubtaskRules(),
    task({ stepCount: MAX_SUBTASKS_PER_TASK }),
    "too_many_steps",
  ],

  // ---- delete and restore (R-f, R-g)
  ["delete: live task", deleteRules(), task(), "allow"],
  ["delete: Done task", deleteRules(), task(done), "allow"],
  ["delete: a step", deleteRules(), step(), "allow"],
  ["delete: already deleted", deleteRules(), task(deleted), "already_deleted"],
  ["restore: deleted task", restoreRules(), task(deleted), "allow"],
  ["restore: live task", restoreRules(), task(), "not_deleted"],
  ["restore: deleted step, live parent", restoreRules(), step(deleted), "allow"],
  [
    "restore: deleted step, deleted parent (R-g)",
    restoreRules(),
    step({
      ...deleted,
      parent: { id: "p", status: "todo", startedAt: null, deletedAt: later(5) },
    }),
    "parent_deleted",
  ],
  [
    "restore: open step into a Done parent",
    restoreRules(),
    step({
      ...deleted,
      status: "todo",
      parent: { id: "p", status: "done", startedAt: later(1), deletedAt: null },
    }),
    "parent_done",
  ],
  [
    "restore: done step into a Done parent",
    restoreRules(),
    step({
      ...deleted,
      ...done,
      parent: { id: "p", status: "done", startedAt: later(1), deletedAt: null },
    }),
    "allow",
  ],
];

describe("task rules: state, one row per case", () => {
  it.each(rows)("%s", (_name, rules, record, expected) => {
    expect(verdict(rules, record)).toBe(expected);
  });
});

// The same rules for every action: whose task is it?
const everyRuleSet: Array<[string, Rules, TaskTarget]> = [
  ["start", startRules(), task()],
  ["move back", moveBackToTodoRules(), task({ status: "in_progress" })],
  ["complete", completeRules(true), task()],
  ["reopen", reopenRules(), task(done)],
  ["backfill start", backfillStartRules(null), task({ status: "done", completedAt: later(60) })],
  ["update task", updateTaskRules(), task()],
  ["update step", updateSubtaskRules(), step()],
  ["change deadline", changeDeadlineRules(), task()],
  ["add step", addSubtaskRules(), task()],
  ["delete", deleteRules(), task()],
  ["restore", restoreRules(), task(deleted)],
];

describe("task rules: relationship (step 4) is the same for every action", () => {
  it.each(everyRuleSet)("%s: the owner may, anyone else gets 'not found'", (_name, rules, record) => {
    expect(verdict(rules, record, owner)).toBe("allow");

    // Another student.
    const other = makeUser({ id: "00000000-0000-4000-8000-0000000000bb" });
    expect(verdict(rules, record, other)).toBe("not_found");
  });

  it.each(everyRuleSet)("%s: not found for Admin and Faculty even holding every key of their role", (_name, rules, record) => {
    // Personal tasks are tier 1: no role, however powerful, reads another person's. The rules never look at
    // the permission set, so even a set with every key in it changes nothing.
    for (const type of ["admin", "faculty"] as const) {
      const { user, permissions } = actor(type);
      const everything = new Set([...permissions, "admin.override", "task.personal.manage"]);
      const decision = runRules(rules, { user: user!, permissions: everything, record });
      expect(decision.allow ? "allow" : decision.code, `${type} / ${_name}`).toBe("not_found");
    }
  });

  it.each(everyRuleSet)("%s: an assignment or team task is not a personal task: not found", (_name, rules, record) => {
    expect(verdict(rules, { ...record, context: "assignment" }, owner)).toBe("not_found");
    expect(verdict(rules, { ...record, context: "team" }, owner)).toBe("not_found");
  });

  it.each(everyRuleSet)("%s: a task with no assignee is not found", (_name, rules, record) => {
    expect(verdict(rules, { ...record, assigneeId: null }, owner)).toBe("not_found");
  });

  it("a refusal for the wrong person never reveals the state (not found beats 'deleted')", () => {
    const other = makeUser({ id: "00000000-0000-4000-8000-0000000000bb" });
    expect(verdict(startRules(), task(deleted), other)).toBe("not_found");
  });
});
