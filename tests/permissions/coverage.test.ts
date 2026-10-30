import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The guard that stops the most likely mistake in Slices 3 to 11: a new server action, page or route
// that forgets its permission check. Every server action, page, layout and route handler under
// src/ must appear in the maps below, with the key it needs, and its source must really call the check.
// Add a row here (and a row in actions-matrix.test.ts) in the same commit as the new action or page.
// A new one that is missing from these maps FAILS this test. (docs/reviews/slice-2-opus-review.md L2)

const SRC = path.resolve(__dirname, "../../src");

const relative = (file: string) => path.relative(SRC, file).split(path.sep).join("/");
const read = (file: string) => fs.readFileSync(file, "utf8");

function allFiles(directory: string): string[] {
  return (fs.readdirSync(directory, { recursive: true }) as string[])
    .map((entry) => path.join(directory, entry))
    .filter((entry) => fs.statSync(entry).isFile());
}

const files = allFiles(SRC);

// --- Server actions ------------------------------------------------------------------------------

type ActionSpec =
  | { check: "authorizeRecord" | "authorize"; keys: readonly string[] }
  | { check: "gate" } // account-state routing, for accounts that are not active yet
  | { check: "public" }; // needs no sign-in (it signs out whoever calls it)

const ACTIONS: Record<string, Record<string, ActionSpec>> = {
  "app/(app)/admin/users/actions.ts": {
    approveUserAction: {
      check: "authorizeRecord",
      keys: ["admin.users.manage", "admin.users.assign_role"],
    },
    reapproveUserAction: {
      check: "authorizeRecord",
      keys: ["admin.users.manage", "admin.users.assign_role"],
    },
    rejectUserAction: { check: "authorizeRecord", keys: ["admin.users.manage"] },
    resetToPendingAction: { check: "authorizeRecord", keys: ["admin.users.manage"] },
  },
  // Personal tasks (tier 1): one key, task.personal.manage. Creating has no record yet, so it uses authorize().
  "app/(app)/tasks/actions.ts": {
    createTaskAction: { check: "authorize", keys: ["task.personal.manage"] },
    createSubtaskAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    updateTaskAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    updateSubtaskAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    changeDeadlineAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    startTaskAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    moveBackToTodoAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    completeTaskAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    reopenTaskAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    backfillStartAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    deleteTaskAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
    restoreTaskAction: { check: "authorizeRecord", keys: ["task.personal.manage"] },
  },
  // AI breakdown (rule AI-e): BOTH keys, ai.use and task.personal.manage. Suggestions are tier 1 (owner only).
  "app/(app)/tasks/ai-actions.ts": {
    requestBreakdownAction: { check: "authorizeRecord", keys: ["ai.use", "task.personal.manage"] },
    saveBreakdownAction: { check: "authorizeRecord", keys: ["ai.use", "task.personal.manage"] },
    discardBreakdownAction: { check: "authorizeRecord", keys: ["ai.use", "task.personal.manage"] },
    rateBreakdownAction: { check: "authorizeRecord", keys: ["ai.use", "task.personal.manage"] },
  },
  "app/(app)/settings/actions.ts": {
    updateTimezoneAction: { check: "authorize", keys: [] }, // any active account
    changePasswordAction: { check: "authorize", keys: [] },
  },
  "app/(onboarding)/welcome/actions.ts": { completeWelcomeAction: { check: "gate" } },
  "components/layout/sign-out-action.ts": { signOutAction: { check: "public" } },
};

const CHECK_TOKEN = {
  authorizeRecord: "authorizeRecord(",
  authorize: "authorize(",
  gate: "gate(",
} as const;

/** Files whose first statement is "use server": every export in them is callable from a browser. */
const serverActionFiles = files.filter((file) => /^\s*"use server"/.test(read(file)));

function exportedFunctions(source: string): string[] {
  return [...source.matchAll(/export async function (\w+)\s*\(/g)].map((match) => match[1]);
}

/** The text of one exported function: from its declaration to the next export or the end of the file. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\nexport (async )?(function|const)/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("every server action asks for its permission", () => {
  it("lists every file that holds server actions", () => {
    expect(serverActionFiles.map(relative).sort()).toEqual(Object.keys(ACTIONS).sort());
  });

  it("uses plain `export async function` for every export (so none can hide from this check)", () => {
    for (const file of serverActionFiles) {
      const source = read(file);
      const otherExports = [
        ...source.matchAll(/^export (?!async function|type |interface )(\w+ )?(\w+)/gm),
      ];
      expect(
        otherExports.map((m) => m[0]),
        relative(file),
      ).toEqual([]);
    }
  });

  for (const [file, actions] of Object.entries(ACTIONS)) {
    describe(file, () => {
      const source = read(path.join(SRC, file));

      it("exports exactly the actions in the map", () => {
        expect(exportedFunctions(source).sort()).toEqual(Object.keys(actions).sort());
      });

      for (const [name, spec] of Object.entries(actions)) {
        it(`${name} calls its check`, () => {
          if (spec.check === "public") return;
          const body = functionBody(source, name);
          expect(body, name).toContain(CHECK_TOKEN[spec.check]);
        });

        if (spec.check === "authorizeRecord" || spec.check === "authorize") {
          it(`${name} names its permission keys: ${spec.keys.join(", ") || "none (any active account)"}`, () => {
            for (const key of spec.keys) expect(source, `${name} / ${key}`).toContain(`"${key}"`);
          });
        }
      }
    });
  }

  it("never reads a user id from the form to decide WHO is acting", () => {
    // The actor is always the signed-in user (from the session); the form only names the record.
    for (const file of serverActionFiles) {
      const source = read(file);
      expect(source, relative(file)).not.toMatch(
        /formData\.get\("(actorId|adminId|currentUserId)"\)/,
      );
    }
  });
});

// --- Pages, layouts and route handlers ---------------------------------------------------------

type PageSpec =
  | { check: "requirePermission"; key: string | null } // null: any active account
  | { check: "gate" }
  | { check: "homeFor" } // only redirects to where the account belongs
  | { check: "auth-handler" };

const PAGES: Record<string, PageSpec> = {
  "app/page.tsx": { check: "homeFor" },
  "app/(public)/sign-in/page.tsx": { check: "gate" },
  "app/(public)/sign-up/page.tsx": { check: "gate" },
  "app/(onboarding)/welcome/page.tsx": { check: "gate" },
  "app/(onboarding)/pending/page.tsx": { check: "gate" },
  "app/(app)/layout.tsx": { check: "requirePermission", key: null },
  "app/(app)/dashboard/page.tsx": { check: "requirePermission", key: "dashboard.view" },
  "app/(app)/settings/page.tsx": { check: "requirePermission", key: null },
  // Personal tasks (tier 1): the key is the check, and every query is scoped to the signed-in user.
  "app/(app)/tasks/page.tsx": { check: "requirePermission", key: "task.personal.manage" },
  "app/(app)/tasks/new/page.tsx": { check: "requirePermission", key: "task.personal.manage" },
  "app/(app)/tasks/[taskId]/page.tsx": { check: "requirePermission", key: "task.personal.manage" },
  "app/(app)/tasks/deleted/page.tsx": { check: "requirePermission", key: "task.personal.manage" },
  "app/(app)/admin/page.tsx": { check: "requirePermission", key: "admin.users.manage" },
  "app/(app)/admin/users/page.tsx": { check: "requirePermission", key: "admin.users.manage" },
  "app/(app)/admin/roles/page.tsx": {
    check: "requirePermission",
    key: "admin.roles.edit_permissions",
  },
  "app/api/auth/[...all]/route.ts": { check: "auth-handler" },
};

const routableFiles = files.filter((file) =>
  /(^|\/)app\/(?:.*\/)?(page|layout|route)\.tsx?$/.test(relative(file)),
);
// The root layout only sets up fonts, the theme and toasts: it reads no user data.
const NO_DATA_LAYOUTS = ["app/layout.tsx"];

describe("every page, layout and route handler is checked", () => {
  it("lists every page, layout and route handler", () => {
    const found = routableFiles.map(relative).filter((file) => !NO_DATA_LAYOUTS.includes(file));
    expect(found.sort()).toEqual(Object.keys(PAGES).sort());
  });

  it("the root layout reads no user data", () => {
    for (const layout of NO_DATA_LAYOUTS) {
      const source = read(path.join(SRC, layout));
      expect(source).not.toMatch(/getCurrentUser|getSession|@\/server\/db/);
    }
  });

  for (const [file, spec] of Object.entries(PAGES)) {
    it(`${file}: ${spec.check}${"key" in spec ? ` (${spec.key ?? "any active account"})` : ""}`, () => {
      const source = read(path.join(SRC, file));
      switch (spec.check) {
        case "requirePermission":
          // The call must name this page's key. null means no key, only an active account.
          expect(source).toMatch(
            spec.key === null
              ? /requirePermission\((null)?\)/
              : new RegExp(`requirePermission\\("${spec.key.replace(/\./g, "\\.")}"\\)`),
          );
          break;
        case "gate":
          expect(source).toContain("gate(");
          break;
        case "homeFor":
          expect(source).toContain("homeFor(");
          break;
        case "auth-handler":
          expect(source).toContain("toNextJsHandler");
          break;
      }
    });
  }

  it("no page imports the database directly (it must go through src/server)", () => {
    for (const file of routableFiles) {
      expect(read(file), relative(file)).not.toMatch(/from "@\/server\/db\//);
    }
  });
});

// --- The guard itself must be able to fail ------------------------------------------------------

describe("the guard notices a forgotten check", () => {
  it("functionBody() finds a call inside one function and not in its neighbour", () => {
    const source = [
      'export async function guarded() { await authorize("a.b"); }',
      "export async function forgot() { return 1; }",
    ].join("\n");
    expect(functionBody(source, "guarded")).toContain("authorize(");
    expect(functionBody(source, "forgot")).not.toContain("authorize(");
  });

  it("exportedFunctions() sees every exported async function", () => {
    expect(
      exportedFunctions("export async function a() {}\nexport async function b(x) {}"),
    ).toEqual(["a", "b"]);
  });
});
