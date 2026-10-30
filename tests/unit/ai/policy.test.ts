import { describe, expect, it } from "vitest";
import {
  discardSuggestionRules,
  rateSuggestionRules,
  saveSuggestionRules,
  type SuggestionOutcome,
  type SuggestionTarget,
} from "@/server/ai/policy";
import { runRules } from "@/server/policies/evaluate-record";
import { actor, defaultKeysFor, makeUser } from "../../helpers/permission-harness";

// A table for src/server/ai/policy.ts: the rules for one AI suggestion. AI history is tier 1: only the owner
// reaches it, and nobody else (Admin and Faculty included) can, whatever keys they hold.

const OWNER_ID = "00000000-0000-4000-8000-0000000000aa";
const TASK_ID = "00000000-0000-4000-8000-000000000101";
const owner = makeUser({ id: OWNER_ID });

function suggestion(overrides: Partial<SuggestionTarget> = {}): SuggestionTarget {
  return {
    id: "00000000-0000-4000-8000-000000000201",
    userId: OWNER_ID,
    taskId: TASK_ID,
    kind: "breakdown",
    outcome: "pending",
    outputValid: true,
    itemsSuggested: 4,
    suggested: [],
    ...overrides,
  };
}

type Rules = ReturnType<typeof discardSuggestionRules>;

function verdict(rules: Rules, record: SuggestionTarget, user = owner): string {
  const decision = runRules(rules, { user, permissions: defaultKeysFor("student"), record });
  return decision.allow ? "allow" : decision.code;
}

const outcomes: SuggestionOutcome[] = ["pending", "accepted", "edited", "discarded", "failed"];

describe("discard", () => {
  it.each(outcomes)("a %s suggestion", (outcome) => {
    expect(verdict(discardSuggestionRules(), suggestion({ outcome }))).toBe(outcome === "pending" ? "allow" : "already_resolved");
  });
});

describe("save the steps", () => {
  it("a pending, valid suggestion for this task", () => {
    expect(verdict(saveSuggestionRules(TASK_ID), suggestion())).toBe("allow");
  });

  it.each(outcomes.filter((outcome) => outcome !== "pending"))("a %s suggestion is already used", (outcome) => {
    expect(verdict(saveSuggestionRules(TASK_ID), suggestion({ outcome }))).toBe("already_resolved");
  });

  it("a suggestion whose answer was not valid", () => {
    expect(verdict(saveSuggestionRules(TASK_ID), suggestion({ outputValid: false }))).toBe("suggestion_not_valid");
  });

  it("a suggestion made for another task", () => {
    expect(verdict(saveSuggestionRules("00000000-0000-4000-8000-000000000999"), suggestion())).toBe("suggestion_mismatch");
    expect(verdict(saveSuggestionRules(TASK_ID), suggestion({ taskId: null }))).toBe("suggestion_mismatch");
  });
});

describe("rate", () => {
  it.each(outcomes)("a %s suggestion", (outcome) => {
    const expected = outcome === "accepted" || outcome === "edited" ? "allow" : "not_saved";
    expect(verdict(rateSuggestionRules(), suggestion({ outcome }))).toBe(expected);
  });
});

const everyRuleSet: Array<[string, Rules, SuggestionTarget]> = [
  ["discard", discardSuggestionRules(), suggestion()],
  ["save", saveSuggestionRules(TASK_ID), suggestion()],
  ["rate", rateSuggestionRules(), suggestion({ outcome: "accepted" })],
];

describe("whose suggestion is it? (the same for every action)", () => {
  it.each(everyRuleSet)("%s: the owner may, anyone else gets 'not found'", (_name, rules, record) => {
    expect(verdict(rules, record, owner)).toBe("allow");
    const other = makeUser({ id: "00000000-0000-4000-8000-0000000000bb" });
    expect(verdict(rules, record, other)).toBe("not_found");
  });

  it.each(everyRuleSet)("%s: not found for Admin and Faculty even holding every key", (_name, rules, record) => {
    for (const type of ["admin", "faculty"] as const) {
      const { user, permissions } = actor(type);
      const everything = new Set([...permissions, "admin.override", "ai.use", "task.personal.manage"]);
      const decision = runRules(rules, { user: user!, permissions: everything, record });
      expect(decision.allow ? "allow" : decision.code, `${type} / ${_name}`).toBe("not_found");
    }
  });

  it.each(everyRuleSet)("%s: a weekly summary is not a breakdown: not found", (_name, rules, record) => {
    expect(verdict(rules, { ...record, kind: "summary" })).toBe("not_found");
  });
});
