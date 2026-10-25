import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";
import {
  allow,
  decisionToFailure,
  notAllowed,
  notFound,
  stateForbids,
} from "@/server/policies/decision";
import {
  evaluateRecordAuthorization,
  failureFor,
  type RecordRules,
  type RecordScope,
  runRules,
} from "@/server/policies/evaluate-record";
import { actor, makeUser } from "../../helpers/permission-harness";

// Steps 4 and 5 of the pipeline, with a made-up record type. Real records arrive with their slices;
// each domain then writes only two small rule functions like the ones below.

type Task = {
  id: string;
  ownerId: string;
  teamId: string | null;
  assigneeId: string | null;
  done: boolean;
};

const OWNER_ID = "00000000-0000-4000-8000-0000000000aa";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  ownerId: OWNER_ID,
  teamId: null,
  assigneeId: null,
  done: false,
  ...overrides,
});

/** An example domain rule set: only the owner may see a task; a finished task cannot change. */
const personalTaskRules: RecordRules<Task> = {
  relationship: ({ user, record }) => (record.ownerId === user.id ? allow : notFound()),
  state: ({ record }) =>
    record.done ? stateForbids("task_done", "A finished task cannot be changed.") : allow,
};

const owner = (): CurrentUser => makeUser({ id: OWNER_ID, roleKey: "student" });
const studentPermissions = actor("student").permissions;

function run(args: {
  user: CurrentUser | null;
  permissions?: ReadonlySet<string>;
  required?: Parameters<typeof evaluateRecordAuthorization>[0]["required"];
  record: Task | null;
  rules?: RecordRules<Task>;
  loadRecord?: (scope: RecordScope) => Promise<Task | null>;
}) {
  return evaluateRecordAuthorization<Task>({
    user: args.user,
    permissions: args.permissions ?? studentPermissions,
    required: args.required ?? "task.personal.manage",
    loadRecord: args.loadRecord ?? (async () => args.record),
    rules: args.rules ?? personalTaskRules,
  });
}

describe("the five steps run in order and the first failure stops everything", () => {
  it("allows when all five steps pass", async () => {
    const result = await run({ user: owner(), record: task() });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.id).toBe("t1");
  });

  it("step 1: signed out", async () => {
    const result = await run({ user: null, record: task() });
    expect(result).toMatchObject({ ok: false, step: 1, reason: "signed_out" });
  });

  it("step 2: account not active", async () => {
    const result = await run({
      user: makeUser({ id: OWNER_ID, status: "deactivated" }),
      record: task(),
    });
    expect(result).toMatchObject({ ok: false, step: 2, reason: "account_not_active" });
  });

  it("step 3: role lacks the key", async () => {
    const result = await run({ user: owner(), permissions: new Set(), record: task() });
    expect(result).toMatchObject({ ok: false, step: 3, reason: "missing_permission" });
  });

  it("step 4: not connected to the record", async () => {
    const stranger = makeUser({ id: "00000000-0000-4000-8000-0000000000bb" });
    const result = await run({ user: stranger, record: task() });
    expect(result).toMatchObject({ ok: false, step: 4, decision: { outcome: "not_found" } });
  });

  it("step 5: the record's state forbids it", async () => {
    const result = await run({ user: owner(), record: task({ done: true }) });
    expect(result).toMatchObject({
      ok: false,
      step: 5,
      decision: { outcome: "state", code: "task_done" },
    });
  });

  it("a record that fails step 4 never reaches the state rule", async () => {
    const state = vi.fn(() => allow);
    const stranger = makeUser({ id: "00000000-0000-4000-8000-0000000000bb" });
    await run({ user: stranger, record: task(), rules: { ...personalTaskRules, state } });
    expect(state).not.toHaveBeenCalled();
  });

  it("works with no state rule at all", async () => {
    const result = await run({
      user: owner(),
      record: task({ done: true }),
      rules: { relationship: personalTaskRules.relationship },
    });
    expect(result.ok).toBe(true);
  });
});

describe("the record is not even loaded unless steps 1 to 3 pass", () => {
  it.each([
    ["signed out", () => ({ user: null })],
    ["account not active", () => ({ user: makeUser({ status: "pending" }) })],
    ["missing permission", () => ({ user: owner(), permissions: new Set<string>() })],
  ])("%s: loadRecord is never called", async (_label, build) => {
    const loadRecord = vi.fn(async () => task());
    await run({ ...build(), record: task(), loadRecord });
    expect(loadRecord).not.toHaveBeenCalled();
  });

  it("when steps 1 to 3 pass, loadRecord is called once with the user and their permissions", async () => {
    const loadRecord = vi.fn(async () => task());
    await run({ user: owner(), record: task(), loadRecord });
    expect(loadRecord).toHaveBeenCalledTimes(1);
    expect(loadRecord).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: OWNER_ID }),
      permissions: studentPermissions,
    });
  });
});

describe("the loader can scope by what the user's role holds (review L3)", () => {
  // The Slice 6 pattern: "rows this user is related to, OR any row if they may read as Admin".
  const scopedLoader = async ({ user, permissions }: RecordScope) => {
    const stored = task({ ownerId: "00000000-0000-4000-8000-0000000000dd" });
    return stored.ownerId === user.id || permissions.has("admin.override") ? stored : null;
  };
  const anyone = { relationship: () => allow } satisfies RecordRules<Task>;

  it("a user whose role holds the key gets the record, one whose role does not gets 'not found'", async () => {
    const stranger = makeUser({ id: "00000000-0000-4000-8000-0000000000bb" });
    const withKey = await run({
      user: stranger,
      permissions: new Set(["task.personal.manage", "admin.override"]),
      record: null,
      loadRecord: scopedLoader,
      rules: anyone,
    });
    const without = await run({
      user: stranger,
      permissions: new Set(["task.personal.manage"]),
      record: null,
      loadRecord: scopedLoader,
      rules: anyone,
    });
    expect(withKey.ok).toBe(true);
    expect(without).toMatchObject({ ok: false, step: 4, decision: { outcome: "not_found" } });
  });
});

describe("runRules() and failureFor()", () => {
  const context = { user: owner(), permissions: studentPermissions, record: task() };

  it("runs the relationship rule first and the state rule second", () => {
    const calls: string[] = [];
    runRules(
      {
        relationship: () => (calls.push("relationship"), allow),
        state: () => (calls.push("state"), allow),
      },
      context,
    );
    expect(calls).toEqual(["relationship", "state"]);
  });

  it("stops at a refused relationship without running the state rule", () => {
    const state = vi.fn(() => allow);
    const decision = runRules({ relationship: () => notFound(), state }, context);
    expect(decision).toMatchObject({ allow: false, step: 4 });
    expect(state).not.toHaveBeenCalled();
  });

  it("failureFor says nothing about why steps 1 to 3 refused", async () => {
    const signedOut = await run({ user: null, record: task() });
    const noKey = await run({ user: owner(), permissions: new Set(), record: task() });
    if (signedOut.ok || noKey.ok) throw new Error("expected a refusal");
    expect(failureFor(signedOut)).toEqual(failureFor(noKey));
    expect(failureFor(signedOut)).toEqual({
      ok: false,
      error: { code: "not_allowed", message: "You cannot do that." },
    });
  });

  it("failureFor passes a record decision's code and message on", async () => {
    const result = await run({ user: owner(), record: task({ done: true }) });
    if (result.ok) throw new Error("expected a refusal");
    expect(failureFor(result)).toEqual({
      ok: false,
      error: { code: "task_done", message: "A finished task cannot be changed." },
    });
  });
});

describe("a record the user may not see is 'not found', never 'forbidden'", () => {
  it("a missing record and a hidden record give the same answer", async () => {
    const stranger = makeUser({ id: "00000000-0000-4000-8000-0000000000bb" });
    const missing = await run({ user: owner(), record: null });
    const hidden = await run({ user: stranger, record: task() });
    expect(missing).toEqual(hidden);
    expect(missing).toMatchObject({ ok: false, step: 4, decision: { outcome: "not_found" } });
  });

  it("the failure an action returns says 'not found' and nothing about permissions", () => {
    const failure = decisionToFailure(notFound());
    expect(failure).toEqual({
      ok: false,
      error: { code: "not_found", message: "That record was not found." },
    });
    expect(JSON.stringify(failure)).not.toMatch(/forbidden|permission|allowed/i);
  });

  it("a visible record the person may not change is 'not allowed', which is a different outcome", async () => {
    // Team task: any active member can see it, only the assignee changes its status (permissions.md §4).
    const member = makeUser({ id: "00000000-0000-4000-8000-0000000000cc", roleKey: "student" });
    const teamTaskRules: RecordRules<Task> = {
      relationship: ({ user }) =>
        user.id === "00000000-0000-4000-8000-0000000000cc" ? allow : notFound(),
      state: undefined,
    };
    const changeStatusRules: RecordRules<Task> = {
      relationship: (context) => {
        const seen = teamTaskRules.relationship(context);
        if (!seen.allow) return seen;
        return context.record.assigneeId === context.user.id
          ? allow
          : notAllowed("not_assignee", "Only the assignee can change a team task's status.");
      },
    };
    const result = await run({
      user: member,
      record: task({ teamId: "team-1", assigneeId: "someone-else" }),
      rules: changeStatusRules,
    });
    expect(result).toMatchObject({
      ok: false,
      step: 4,
      decision: { outcome: "not_allowed", code: "not_assignee" },
    });
  });
});

describe("decisions", () => {
  it("allow is allow", () => {
    expect(allow).toEqual({ allow: true });
  });

  it("each refusal records its step and outcome", () => {
    expect(notFound()).toMatchObject({ allow: false, step: 4, outcome: "not_found" });
    expect(notAllowed("x", "y")).toMatchObject({
      allow: false,
      step: 4,
      outcome: "not_allowed",
      code: "x",
    });
    expect(stateForbids("x", "y")).toMatchObject({
      allow: false,
      step: 5,
      outcome: "state",
      code: "x",
    });
  });
});
