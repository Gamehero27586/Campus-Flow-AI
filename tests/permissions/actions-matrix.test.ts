import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/lib/result";
import type { CurrentUser } from "@/server/auth/current-user";
import { seedBase } from "@/server/auth/seed-base";
import {
  aiSuggestions,
  auditLogs,
  permissions,
  rolePermissions,
  roles,
  taskEvents,
  tasks,
  users,
} from "@/server/db/schema";
import { asCurrentUser, insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// The REAL server actions, called with real FormData, for every kind of actor. Each row says what
// must happen, written out by hand. Together with coverage.test.ts this means an action that asks for
// the wrong key, or for no key, makes a row fail. (docs/reviews/slice-2-opus-review.md L2)
//
// Only the edges are replaced: the database (an in-memory Postgres with the real migrations), "who is
// signed in" (the test says), and Next.js's redirect / notFound / revalidate (they throw or do nothing).

const mocks = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(public to: string) {
      super(`redirect:${to}`);
    }
  }
  class NotFoundSignal extends Error {}
  return { db: null as unknown, current: null as unknown, RedirectSignal, NotFoundSignal };
});

vi.mock("@/server/db/client", () => ({
  get db() {
    return mocks.db;
  },
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: async () => mocks.current }));
// The per-request cache is a Next.js feature; the real, uncached reader is used instead.
vi.mock("@/server/auth/load-permissions", async () => ({
  loadPermissionKeys: (await import("@/server/auth/read-permissions")).readPermissionKeys,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new mocks.RedirectSignal(to);
  },
  notFound: () => {
    throw new mocks.NotFoundSignal();
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// The AI actions run for real, but the model is the fixed fake (no Ollama, no network).
vi.mock("@/server/ai/runtime", async () => {
  const { createFakeClient } = await import("@/server/ai/fake-client");
  const client = createFakeClient();
  return { getOllamaClient: () => client };
});

// The database must exist BEFORE the actions are imported: Better Auth (used by the welcome action)
// is built from the database client when its module loads.
const testDatabase = await createTestDb();
const db: TestDb = testDatabase.db;
mocks.db = db;

// Imported after the mocks and the database are in place.
const admin = await import("@/app/(app)/admin/users/actions");
const settings = await import("@/app/(app)/settings/actions");
const welcome = await import("@/app/(onboarding)/welcome/actions");
const taskActions = await import("@/app/(app)/tasks/actions");
const aiActions = await import("@/app/(app)/tasks/ai-actions");

let roleIds: Record<string, string>;

beforeAll(async () => {
  await seedBase();
  const rows = await db.select().from(roles);
  roleIds = Object.fromEntries(rows.map((row) => [row.key, row.id]));
});

afterAll(async () => {
  await testDatabase.client.close();
});

// --- Actors ---------------------------------------------------------------------------------------

type ActorKind =
  | "signed out"
  | "no username yet"
  | "pending"
  | "rejected"
  | "deactivated"
  | "student"
  | "faculty"
  | "admin"
  | "admin without assign_role"
  | "student with stray admin grants"
  | "faculty with personal tasks on";

type Setup = { user: CurrentUser | null; restore: () => Promise<void> };

async function grantRow(roleKey: string, permissionKey: string) {
  const [permission] = await db
    .select()
    .from(permissions)
    .where(eq(permissions.key, permissionKey));
  return { roleId: roleIds[roleKey], permissionId: permission.id };
}

/** Signs the actor in (for the mocked "who is signed in") and returns how to put the database back. */
async function actAs(kind: ActorKind): Promise<Setup> {
  const nothing = async () => {};
  const make = async (
    status: "pending" | "active" | "rejected" | "deactivated",
    roleKey: string | null,
    username: string | null = `actor_${randomUUID().slice(0, 8)}`,
  ) => {
    const row = await insertUser(db, {
      status,
      username,
      roleId: roleKey ? roleIds[roleKey] : null,
    });
    return asCurrentUser(row, roleKey);
  };

  let setup: Setup;
  switch (kind) {
    case "signed out":
      setup = { user: null, restore: nothing };
      break;
    case "no username yet":
      setup = { user: await make("pending", null, null), restore: nothing };
      break;
    case "pending":
      setup = { user: await make("pending", null), restore: nothing };
      break;
    case "rejected":
      setup = { user: await make("rejected", "student"), restore: nothing };
      break;
    case "deactivated":
      setup = { user: await make("deactivated", "student"), restore: nothing };
      break;
    case "student":
      setup = { user: await make("active", "student"), restore: nothing };
      break;
    case "faculty":
      setup = { user: await make("active", "faculty"), restore: nothing };
      break;
    case "admin":
      setup = { user: await make("active", "admin"), restore: nothing };
      break;
    case "admin without assign_role": {
      const grant = await grantRow("admin", "admin.users.assign_role");
      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, grant.roleId),
            eq(rolePermissions.permissionId, grant.permissionId),
          ),
        );
      setup = {
        user: await make("active", "admin"),
        restore: async () => void (await db.insert(rolePermissions).values(grant)),
      };
      break;
    }
    case "faculty with personal tasks on": {
      // Personal tasks are off for Faculty by default; an Admin may switch them on (the key is eligible).
      const grant = await grantRow("faculty", "task.personal.manage");
      await db.insert(rolePermissions).values(grant);
      setup = {
        user: await make("active", "faculty"),
        restore: async () => {
          await db
            .delete(rolePermissions)
            .where(
              and(
                eq(rolePermissions.roleId, grant.roleId),
                eq(rolePermissions.permissionId, grant.permissionId),
              ),
            );
        },
      };
      break;
    }
    case "student with stray admin grants": {
      // Rows added by hand: the server must ignore them (review L1).
      const rows = [
        await grantRow("student", "admin.users.manage"),
        await grantRow("student", "admin.users.assign_role"),
      ];
      await db.insert(rolePermissions).values(rows);
      setup = {
        user: await make("active", "student"),
        restore: async () => {
          for (const grant of rows) {
            await db
              .delete(rolePermissions)
              .where(
                and(
                  eq(rolePermissions.roleId, grant.roleId),
                  eq(rolePermissions.permissionId, grant.permissionId),
                ),
              );
          }
        },
      };
      break;
    }
  }
  mocks.current = setup.user;
  return setup;
}

/** What happened, in one short word: "ok", "fail:<code>", "redirect:<path>" or "notFound". */
async function outcome(run: () => Promise<FormState>): Promise<string> {
  try {
    const result = await run();
    if (result === null) return "null";
    return result.ok ? "ok" : `fail:${result.error.code}`;
  } catch (error) {
    if (error instanceof mocks.RedirectSignal) return `redirect:${error.to}`;
    if (error instanceof mocks.NotFoundSignal) return "notFound";
    throw error;
  }
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

async function newTarget(
  status: "pending" | "rejected",
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  return insertUser(db, {
    status,
    emailVerified: true,
    username: `target_${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
}

async function reload(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

async function auditAbout(targetId: string) {
  return db.select().from(auditLogs).where(eq(auditLogs.targetId, targetId));
}

// --- The Admin Users actions ----------------------------------------------------------------------

const NOT_ALLOWED = "fail:not_allowed";

type AdminAction = {
  name: string;
  run: (targetId: string) => Promise<string>;
  targetStatus: "pending" | "rejected";
  /** The status the target ends in when the action is allowed. */
  endsAs: "active" | "rejected" | "pending";
  /** Who may do it, by hand. Everyone else gets NOT_ALLOWED and nothing changes. */
  allowed: ActorKind[];
};

const call = (
  action: (state: null, data: FormData) => Promise<FormState>,
  fields: Record<string, string>,
) => outcome(() => action(null, form(fields)));

const ADMIN_ACTIONS: AdminAction[] = [
  {
    // Approving sets a role, so it needs admin.users.manage AND admin.users.assign_role.
    name: "approveUserAction",
    run: (id) =>
      call(admin.approveUserAction, { userId: id, role: "student", confirmedEmailOwner: "on" }),
    targetStatus: "pending",
    endsAs: "active",
    allowed: ["admin"],
  },
  {
    name: "reapproveUserAction",
    run: (id) =>
      call(admin.reapproveUserAction, { userId: id, role: "faculty", confirmedEmailOwner: "on" }),
    targetStatus: "rejected",
    endsAs: "active",
    allowed: ["admin"],
  },
  {
    // Rejecting sets no role, so admin.users.manage alone is enough.
    name: "rejectUserAction",
    run: (id) => call(admin.rejectUserAction, { userId: id, reason: "Not eligible" }),
    targetStatus: "pending",
    endsAs: "rejected",
    allowed: ["admin", "admin without assign_role"],
  },
  {
    name: "resetToPendingAction",
    run: (id) => call(admin.resetToPendingAction, { userId: id }),
    targetStatus: "rejected",
    endsAs: "pending",
    allowed: ["admin", "admin without assign_role"],
  },
];

const ALL_ACTORS: ActorKind[] = [
  "signed out",
  "no username yet",
  "pending",
  "rejected",
  "deactivated",
  "student",
  "faculty",
  "admin",
  "admin without assign_role",
  "student with stray admin grants",
];

describe.each(ADMIN_ACTIONS)("$name", (action) => {
  it.each(ALL_ACTORS)("as %s", async (kind) => {
    const target = await newTarget(action.targetStatus);
    const setup = await actAs(kind);
    try {
      const result = await action.run(target.id);
      const mayDoIt = action.allowed.includes(kind);

      expect(result).toBe(mayDoIt ? "ok" : NOT_ALLOWED);

      // A refused request changed nothing and left no audit row; an allowed one did exactly its job.
      const after = await reload(target.id);
      expect(after.status).toBe(mayDoIt ? action.endsAs : action.targetStatus);
      expect(await auditAbout(target.id)).toHaveLength(mayDoIt ? 1 : 0);
    } finally {
      await setup.restore();
    }
  });

  it("as admin: an account that does not exist is 'not found'", async () => {
    const setup = await actAs("admin");
    try {
      expect(await action.run(randomUUID())).toBe("fail:not_found");
    } finally {
      await setup.restore();
    }
  });

  it("as a student: an account that does not exist gives the same answer as any other refusal", async () => {
    // A refused person must not learn which ids exist: step 3 answers before the record is looked up.
    const setup = await actAs("student");
    try {
      expect(await action.run(randomUUID())).toBe(NOT_ALLOWED);
    } finally {
      await setup.restore();
    }
  });

  it("as admin: a bad id is rejected as invalid input before anything else", async () => {
    const setup = await actAs("admin");
    try {
      expect(await action.run("not-a-uuid")).toMatch(/^fail:invalid_input$/);
    } finally {
      await setup.restore();
    }
  });
});

describe("the Admin Users actions: record rules, as an allowed Admin", () => {
  it("refuses the Admin's own account (approve, reapprove, reject, reset)", async () => {
    const setup = await actAs("admin");
    const self = setup.user!.id;
    try {
      expect(
        await call(admin.approveUserAction, {
          userId: self,
          role: "student",
          confirmedEmailOwner: "on",
        }),
      ).toBe("fail:self_action");
      expect(
        await call(admin.reapproveUserAction, {
          userId: self,
          role: "student",
          confirmedEmailOwner: "on",
        }),
      ).toBe("fail:self_action");
      expect(await call(admin.rejectUserAction, { userId: self, reason: "" })).toBe(
        "fail:self_action",
      );
      expect(await call(admin.resetToPendingAction, { userId: self })).toBe("fail:self_action");
    } finally {
      await setup.restore();
    }
  });

  it("approve: an unverified email needs the confirmation, and the target stays pending without it", async () => {
    const target = await newTarget("pending", { emailVerified: false });
    const setup = await actAs("admin");
    try {
      expect(await call(admin.approveUserAction, { userId: target.id, role: "student" })).toBe(
        "fail:email_unconfirmed",
      );
      expect((await reload(target.id)).status).toBe("pending");
      expect(
        await call(admin.approveUserAction, {
          userId: target.id,
          role: "student",
          confirmedEmailOwner: "on",
        }),
      ).toBe("ok");
    } finally {
      await setup.restore();
    }
  });

  it("approve: a target with no username, or one already active, is refused", async () => {
    const noName = await newTarget("pending", { username: null });
    const active = await insertUser(db, { status: "active" });
    const setup = await actAs("admin");
    try {
      expect(
        await call(admin.approveUserAction, {
          userId: noName.id,
          role: "student",
          confirmedEmailOwner: "on",
        }),
      ).toBe("fail:welcome_incomplete");
      expect(
        await call(admin.approveUserAction, {
          userId: active.id,
          role: "student",
          confirmedEmailOwner: "on",
        }),
      ).toBe("fail:not_pending");
    } finally {
      await setup.restore();
    }
  });

  it("reapprove refuses a pending account, and approve refuses a rejected one", async () => {
    const pending = await newTarget("pending");
    const rejected = await newTarget("rejected");
    const setup = await actAs("admin");
    try {
      expect(
        await call(admin.reapproveUserAction, {
          userId: pending.id,
          role: "student",
          confirmedEmailOwner: "on",
        }),
      ).toBe("fail:not_rejected");
      expect(
        await call(admin.approveUserAction, {
          userId: rejected.id,
          role: "student",
          confirmedEmailOwner: "on",
        }),
      ).toBe("fail:not_pending");
    } finally {
      await setup.restore();
    }
  });

  it("approve: Admin cannot be chosen as the role (only student and faculty)", async () => {
    const target = await newTarget("pending");
    const setup = await actAs("admin");
    try {
      expect(
        await call(admin.approveUserAction, {
          userId: target.id,
          role: "admin",
          confirmedEmailOwner: "on",
        }),
      ).toBe("fail:invalid_input");
      expect((await reload(target.id)).status).toBe("pending");
    } finally {
      await setup.restore();
    }
  });
});

// --- Settings: any active account, nobody else ----------------------------------------------------

const SETTINGS_ACTIONS = [
  {
    name: "updateTimezoneAction",
    run: () => call(settings.updateTimezoneAction, { timezone: "Asia/Kolkata" }),
    // Active accounts pass the check and the change is saved.
    active: "ok",
  },
  {
    name: "changePasswordAction",
    run: () =>
      call(settings.changePasswordAction, {
        currentPassword: "old-password-1",
        newPassword: "new-password-12",
      }),
    // Active accounts pass the check; these test accounts have no password login, so it says so.
    active: "fail:no_password",
  },
] as const;

describe.each(SETTINGS_ACTIONS)("$name", (action) => {
  it.each(["signed out", "no username yet", "pending", "rejected", "deactivated"] as ActorKind[])(
    "as %s: refused",
    async (kind) => {
      const setup = await actAs(kind);
      try {
        expect(await action.run()).toBe(NOT_ALLOWED);
      } finally {
        await setup.restore();
      }
    },
  );

  it.each(["student", "faculty", "admin"] as ActorKind[])(
    "as %s: passes the check",
    async (kind) => {
      const setup = await actAs(kind);
      try {
        expect(await action.run()).toBe(action.active);
      } finally {
        await setup.restore();
      }
    },
  );
});

describe("updateTimezoneAction changes only the signed-in user's own account", () => {
  it("saves the time zone for the actor and for nobody else", async () => {
    const bystander = await insertUser(db, { status: "active", timezone: "Asia/Kolkata" });
    const setup = await actAs("student");
    try {
      expect(await call(settings.updateTimezoneAction, { timezone: "America/New_York" })).toBe(
        "ok",
      );
      expect((await reload(setup.user!.id)).timezone).toBe("America/New_York");
      expect((await reload(bystander.id)).timezone).toBe("Asia/Kolkata");
    } finally {
      await setup.restore();
    }
  });

  // Bare offsets mean opposite things in Node and PostgreSQL: for "+05:30", Node's Intl reads 5.5 hours EAST
  // of UTC but PostgreSQL's AT TIME ZONE reads 5.5 hours WEST (so 12:00 local on 2 Nov would be 17:30 UTC
  // instead of 06:30 UTC, 11 hours out). Only IANA names are accepted.
  it.each(["Mars/Olympus_Mons", "+05:30", "-03:00", "+0530"])(
    "refuses %s before anything is saved",
    async (timezone) => {
      const setup = await actAs("student");
      try {
        expect(await call(settings.updateTimezoneAction, { timezone })).toBe("fail:invalid_input");
        expect((await reload(setup.user!.id)).timezone).toBe("Asia/Kolkata");
      } finally {
        await setup.restore();
      }
    },
  );
});

// --- Welcome: for accounts that are not active yet, so it uses the gate, not a permission key ------

describe("completeWelcomeAction", () => {
  const run = () =>
    call(welcome.completeWelcomeAction, { username: "valid.name", requestedRole: "" });

  it.each([
    ["signed out", "redirect:/sign-in"],
    // A new account may choose its username. (Better Auth then refuses here because the test has no
    // real session cookie; what matters is that the gate let it through to the command.)
    ["no username yet", "fail:username_unavailable"],
    // A pending account that already has a username may open the page; the command refuses a second go.
    ["pending", "fail:already_set"],
    ["rejected", "redirect:/pending"],
    ["deactivated", "redirect:/pending"],
    ["student", "redirect:/dashboard"],
    ["admin", "redirect:/dashboard"],
  ] as Array<[ActorKind, string]>)("as %s: %s", async (kind, expected) => {
    const setup = await actAs(kind);
    try {
      expect(await run()).toBe(expected);
    } finally {
      await setup.restore();
    }
  });
});

// --- Personal tasks (Slice 3) ---------------------------------------------------------------------
// Personal tasks are tier 1 data: only the owner may read or change one. Every action is run as every kind
// of actor against (a) the actor's OWN task, which is in the right state for the action, and (b) a task
// that belongs to another student. A refused request must change nothing and write no event.

const TASK_ACTORS: ActorKind[] = [...ALL_ACTORS, "faculty with personal tasks on"];
/** The only actors who hold task.personal.manage: Student by default, Faculty once an Admin turns it on. */
const TASK_OWNERS: ActorKind[] = [
  "student",
  "student with stray admin grants", // still a Student: the stray grants add nothing and take nothing
  "faculty with personal tasks on",
];

const LONG_AGO = new Date("2026-01-01T00:00:00Z");

async function insertTask(ownerId: string, overrides: Partial<typeof tasks.$inferInsert> = {}) {
  const [row] = await db
    .insert(tasks)
    .values({
      context: "personal",
      createdBy: ownerId,
      assigneeId: ownerId,
      title: "Read chapter 4",
      category: "study",
      createdAt: LONG_AGO,
      updatedAt: LONG_AGO,
      ...overrides,
    })
    .returning();
  return row;
}

async function taskSnapshot(id: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, id));
  return { row, events: events.length };
}

type TaskAction = {
  name: string;
  /** Creates what the action needs for this owner, in the right state, and returns the id to send. */
  fixture: (ownerId: string) => Promise<string>;
  run: (taskId: string) => Promise<string>;
};

const TASK_ACTIONS: TaskAction[] = [
  {
    name: "startTaskAction",
    fixture: async (owner) => (await insertTask(owner)).id,
    run: (id) => call(taskActions.startTaskAction, { taskId: id }),
  },
  {
    name: "moveBackToTodoAction",
    fixture: async (owner) =>
      (await insertTask(owner, { status: "in_progress", startedAt: LONG_AGO })).id,
    run: (id) => call(taskActions.moveBackToTodoAction, { taskId: id }),
  },
  {
    name: "completeTaskAction",
    fixture: async (owner) => (await insertTask(owner)).id,
    run: (id) => call(taskActions.completeTaskAction, { taskId: id }),
  },
  {
    name: "reopenTaskAction",
    fixture: async (owner) =>
      (
        await insertTask(owner, {
          status: "done",
          startedAt: LONG_AGO,
          completedAt: new Date("2026-01-05T00:00:00Z"),
        })
      ).id,
    run: (id) => call(taskActions.reopenTaskAction, { taskId: id, to: "todo" }),
  },
  {
    name: "backfillStartAction",
    fixture: async (owner) =>
      (await insertTask(owner, { status: "done", completedAt: new Date("2026-01-05T00:00:00Z") })).id,
    run: (id) =>
      call(taskActions.backfillStartAction, {
        taskId: id,
        startDate: "2026-01-03",
        startTime: "10:00",
      }),
  },
  {
    name: "changeDeadlineAction",
    fixture: async (owner) => (await insertTask(owner)).id,
    run: (id) =>
      call(taskActions.changeDeadlineAction, {
        taskId: id,
        deadlineDate: "2026-12-01",
        deadlineTime: "",
      }),
  },
  {
    name: "updateTaskAction",
    fixture: async (owner) => (await insertTask(owner)).id,
    run: (id) =>
      call(taskActions.updateTaskAction, {
        taskId: id,
        title: "Renamed",
        description: "",
        category: "reading",
        categoryOther: "",
        priority: "high",
        estimateMinutes: "",
      }),
  },
  {
    name: "updateSubtaskAction",
    fixture: async (owner) => {
      const parent = await insertTask(owner);
      return (await insertTask(owner, { parentTaskId: parent.id, title: "A step" })).id;
    },
    run: (id) =>
      call(taskActions.updateSubtaskAction, {
        taskId: id,
        title: "Renamed step",
        estimateMinutes: "",
      }),
  },
  {
    name: "createSubtaskAction",
    fixture: async (owner) => (await insertTask(owner)).id,
    run: (id) => call(taskActions.createSubtaskAction, { taskId: id, title: "New step" }),
  },
  {
    name: "deleteTaskAction",
    fixture: async (owner) => (await insertTask(owner)).id,
    run: (id) => call(taskActions.deleteTaskAction, { taskId: id }),
  },
  {
    name: "restoreTaskAction",
    fixture: async (owner) =>
      (
        await insertTask(owner, {
          deletedAt: new Date("2026-01-02T00:00:00Z"),
          deletedReason: "user_deleted",
        })
      ).id,
    run: (id) => call(taskActions.restoreTaskAction, { taskId: id }),
  },
];

describe.each(TASK_ACTIONS)("$name", (action) => {
  it.each(TASK_ACTORS)("as %s, on their own task", async (kind) => {
    const setup = await actAs(kind);
    try {
      const id = await action.fixture(setup.user?.id ?? (await insertUser(db)).id);
      const before = await taskSnapshot(id);
      const mayDoIt = TASK_OWNERS.includes(kind);

      expect(await action.run(id)).toBe(mayDoIt ? "ok" : NOT_ALLOWED);

      const after = await taskSnapshot(id);
      if (mayDoIt) {
        // createSubtask changes the parent's steps, not its own row, so look at the whole task tree.
        const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
        expect(after.row !== before.row && (JSON.stringify(after.row) !== JSON.stringify(before.row) || steps.length > 0)).toBe(true);
      } else {
        // A refused request changed nothing and left no event.
        expect(after).toEqual(before);
      }
    } finally {
      await setup.restore();
    }
  });

  it.each(TASK_ACTORS)("as %s, on another student's task", async (kind) => {
    const setup = await actAs(kind);
    try {
      const stranger = await insertUser(db, { status: "active" });
      const id = await action.fixture(stranger.id);
      const before = await taskSnapshot(id);

      const result = await action.run(id);

      // Someone who holds the key is told "not found" (the task does not exist for them); everyone else
      // is stopped earlier, by the key, and cannot tell whether the id exists.
      expect(result).toBe(TASK_OWNERS.includes(kind) ? "fail:not_found" : NOT_ALLOWED);
      expect(await taskSnapshot(id)).toEqual(before);
    } finally {
      await setup.restore();
    }
  });

  it("as a student: an id that does not exist is 'not found'", async () => {
    const setup = await actAs("student");
    try {
      expect(await action.run(randomUUID())).toBe("fail:not_found");
    } finally {
      await setup.restore();
    }
  });

  it("as admin: an id that does not exist gives the same answer as any other refusal", async () => {
    const setup = await actAs("admin");
    try {
      expect(await action.run(randomUUID())).toBe(NOT_ALLOWED);
    } finally {
      await setup.restore();
    }
  });

  it("as a student: a bad id is rejected as invalid input", async () => {
    const setup = await actAs("student");
    try {
      expect(await action.run("not-a-uuid")).toBe("fail:invalid_input");
    } finally {
      await setup.restore();
    }
  });
});

describe("tier 1: Admin and Faculty never reach a student's personal task", () => {
  it("Admin is refused by every task action on a student's task, and nothing changes", async () => {
    const student = await insertUser(db, { status: "active" });
    const setup = await actAs("admin");
    try {
      for (const action of TASK_ACTIONS) {
        const id = await action.fixture(student.id);
        const before = await taskSnapshot(id);
        expect(await action.run(id), action.name).toBe(NOT_ALLOWED);
        expect(await taskSnapshot(id), action.name).toEqual(before);
      }
    } finally {
      await setup.restore();
    }
  });

  it("Faculty with personal tasks on can use only their own: a student's task is 'not found'", async () => {
    const student = await insertUser(db, { status: "active" });
    const setup = await actAs("faculty with personal tasks on");
    try {
      const id = (await insertTask(student.id)).id;
      expect(await call(taskActions.deleteTaskAction, { taskId: id })).toBe("fail:not_found");
      expect((await taskSnapshot(id)).row.deletedAt).toBeNull();
    } finally {
      await setup.restore();
    }
  });

  it("an assignment task of the actor's own is not a personal task: 'not found'", async () => {
    const teacher = await insertUser(db, { status: "active" });
    const setup = await actAs("student");
    try {
      const [assignmentTask] = await db
        .insert(tasks)
        .values({
          context: "assignment",
          createdBy: teacher.id,
          assigneeId: setup.user!.id,
          assignmentId: randomUUID(),
          title: "Lab report",
          category: "assignment",
          createdAt: LONG_AGO,
          updatedAt: LONG_AGO,
        })
        .returning();
      expect(await call(taskActions.completeTaskAction, { taskId: assignmentTask.id })).toBe(
        "fail:not_found",
      );
      expect((await taskSnapshot(assignmentTask.id)).row.status).toBe("todo");
    } finally {
      await setup.restore();
    }
  });
});

describe("createTaskAction", () => {
  const fields = { title: "Plan the report", category: "study", priority: "" };

  it.each(TASK_ACTORS)("as %s", async (kind) => {
    const setup = await actAs(kind);
    try {
      const mayDoIt = TASK_OWNERS.includes(kind);
      const owner = setup.user?.id;
      const countBefore = owner
        ? (await db.select().from(tasks).where(eq(tasks.createdBy, owner))).length
        : 0;

      expect(await call(taskActions.createTaskAction, fields)).toBe(mayDoIt ? "ok" : NOT_ALLOWED);

      if (owner) {
        const mine = await db.select().from(tasks).where(eq(tasks.createdBy, owner));
        expect(mine).toHaveLength(countBefore + (mayDoIt ? 1 : 0));
        if (mayDoIt) {
          expect(mine[0]).toMatchObject({
            context: "personal",
            assigneeId: owner,
            title: "Plan the report",
          });
        }
      }
    } finally {
      await setup.restore();
    }
  });

  it("returns the new task's id and creates the steps with it", async () => {
    const setup = await actAs("student");
    try {
      const data = new FormData();
      data.set("title", "Plan the report");
      data.set("category", "study");
      data.append("steps", "Outline");
      data.append("steps", "");
      data.append("steps", "Draft");
      const result = await taskActions.createTaskAction(null, data);
      expect(result?.ok).toBe(true);
      const taskId = (result as { data: { taskId: string } }).data.taskId;
      const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, taskId));
      expect(steps.map((s) => s.title).sort()).toEqual(["Draft", "Outline"]);
    } finally {
      await setup.restore();
    }
  });

  it("refuses bad input with field messages and creates nothing", async () => {
    const setup = await actAs("student");
    try {
      const bad: Array<Record<string, string>> = [
        { ...fields, title: "   " },
        { ...fields, category: "other" },
        { ...fields, deadlineDate: "20266-01-01" },
        { ...fields, deadlineTime: "10:00" },
        { ...fields, estimateMinutes: "6001" },
      ];
      for (const input of bad) {
        expect(await call(taskActions.createTaskAction, input), JSON.stringify(input)).toBe(
          "fail:invalid_input",
        );
      }
      expect(
        await db.select().from(tasks).where(eq(tasks.createdBy, setup.user!.id)),
      ).toHaveLength(0);
    } finally {
      await setup.restore();
    }
  });
});

describe("task actions: the record rules, as the owner", () => {
  it("completing a task with open steps asks for the choice, then 'complete all' finishes them", async () => {
    const setup = await actAs("student");
    try {
      const parent = await insertTask(setup.user!.id);
      await insertTask(setup.user!.id, { parentTaskId: parent.id, title: "Step" });
      expect(await call(taskActions.completeTaskAction, { taskId: parent.id })).toBe(
        "fail:open_steps",
      );
      expect(
        await call(taskActions.completeTaskAction, { taskId: parent.id, completeAllSteps: "on" }),
      ).toBe("ok");
      const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, parent.id));
      expect(steps.every((s) => s.status === "done")).toBe(true);
    } finally {
      await setup.restore();
    }
  });

  it("a deleted task is refused every action but restore", async () => {
    const setup = await actAs("student");
    try {
      const task = await insertTask(setup.user!.id, {
        deletedAt: new Date("2026-01-02T00:00:00Z"),
        deletedReason: "user_deleted",
      });
      expect(await call(taskActions.startTaskAction, { taskId: task.id })).toBe("fail:task_deleted");
      expect(await call(taskActions.deleteTaskAction, { taskId: task.id })).toBe(
        "fail:already_deleted",
      );
      expect(await call(taskActions.restoreTaskAction, { taskId: task.id })).toBe("ok");
    } finally {
      await setup.restore();
    }
  });

  it("P2: the messages say 'Step' for a step and 'Task' for a task", async () => {
    const setup = await actAs("student");
    try {
      const parent = await insertTask(setup.user!.id);
      const step = await insertTask(setup.user!.id, { parentTaskId: parent.id, title: "Step" });
      const message = async (
        action: (state: null, data: FormData) => Promise<FormState>,
        id: string,
      ) => {
        const result = await action(null, form({ taskId: id }));
        return result?.ok ? result.message : "failed";
      };
      expect(await message(taskActions.deleteTaskAction, step.id)).toBe("Step deleted.");
      expect(await message(taskActions.restoreTaskAction, step.id)).toBe("Step restored.");
      expect(await message(taskActions.deleteTaskAction, parent.id)).toBe("Task deleted.");
      expect(await message(taskActions.restoreTaskAction, parent.id)).toBe("Task restored.");
    } finally {
      await setup.restore();
    }
  });

  it("delete then restore round-trips, and a step of a deleted parent says 'restore the task first'", async () => {
    const setup = await actAs("student");
    try {
      const parent = await insertTask(setup.user!.id);
      const step = await insertTask(setup.user!.id, { parentTaskId: parent.id, title: "Step" });
      expect(await call(taskActions.deleteTaskAction, { taskId: parent.id })).toBe("ok");
      expect(await call(taskActions.restoreTaskAction, { taskId: step.id })).toBe(
        "fail:parent_deleted",
      );
      expect(await call(taskActions.restoreTaskAction, { taskId: parent.id })).toBe("ok");
      expect((await taskSnapshot(step.id)).row.deletedAt).toBeNull();
    } finally {
      await setup.restore();
    }
  });
});

// --- AI breakdown (Slice 4) -----------------------------------------------------------------------
// Rule AI-e: requesting, saving, discarding (and rating) need BOTH ai.use and task.personal.manage. Students hold
// both by default. Faculty may be given the task key but not ai.use (it is not on for them by default), so
// "faculty with personal tasks on" is refused. A suggestion is tier 1: only its owner reaches it.

const AI_OWNERS: ActorKind[] = ["student", "student with stray admin grants"];

const SUGGESTED = [
  { title: "Read the first half", minutes: 30 },
  { title: "Read the second half", minutes: 30 },
  { title: "Write the notes", minutes: 20 },
];

async function insertSuggestion(
  ownerId: string,
  taskId: string,
  overrides: Partial<typeof aiSuggestions.$inferInsert> = {},
) {
  const [row] = await db
    .insert(aiSuggestions)
    .values({
      userId: ownerId,
      taskId,
      kind: "breakdown",
      model: "fake-model",
      promptVersion: "breakdown.v2",
      inputSnapshot: { title: "Read chapter 4", suggested: SUGGESTED.map((s) => ({ ...s, deadline: null })) },
      outputValid: true,
      itemsSuggested: SUGGESTED.length,
      createdAt: LONG_AGO,
      ...overrides,
    })
    .returning();
  return row;
}

type AiIds = { taskId: string; suggestionId: string };

async function aiSnapshot(ids: AiIds) {
  const suggestions = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.taskId, ids.taskId))
    .orderBy(aiSuggestions.createdAt, aiSuggestions.id);
  const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, ids.taskId));
  return { suggestions, steps: steps.length };
}

function saveForm(ids: AiIds): FormData {
  const data = new FormData();
  data.set("taskId", ids.taskId);
  data.set("suggestionId", ids.suggestionId);
  for (const [index, item] of SUGGESTED.entries()) {
    data.append("title", item.title);
    data.append("estimateMinutes", String(item.minutes));
    data.append("deadlineDate", "");
    data.append("deadlineTime", "");
    data.append("suggestedIndex", String(index));
  }
  return data;
}

type AiAction = {
  name: string;
  /** Creates what the action needs for this owner, in the right state. */
  fixture: (ownerId: string) => Promise<AiIds>;
  run: (ids: AiIds) => Promise<string>;
};

const withTask = async (ownerId: string) => (await insertTask(ownerId)).id;

const AI_ACTIONS: AiAction[] = [
  {
    name: "requestBreakdownAction",
    fixture: async (owner) => ({ taskId: await withTask(owner), suggestionId: randomUUID() }),
    run: (ids) => call(aiActions.requestBreakdownAction, { taskId: ids.taskId }),
  },
  {
    name: "saveBreakdownAction",
    fixture: async (owner) => {
      const taskId = await withTask(owner);
      return { taskId, suggestionId: (await insertSuggestion(owner, taskId)).id };
    },
    run: (ids) => outcome(() => aiActions.saveBreakdownAction(null, saveForm(ids))),
  },
  {
    name: "discardBreakdownAction",
    fixture: async (owner) => {
      const taskId = await withTask(owner);
      return { taskId, suggestionId: (await insertSuggestion(owner, taskId)).id };
    },
    run: (ids) => call(aiActions.discardBreakdownAction, { suggestionId: ids.suggestionId }),
  },
  {
    name: "rateBreakdownAction",
    fixture: async (owner) => {
      const taskId = await withTask(owner);
      const saved = await insertSuggestion(owner, taskId, {
        outcome: "accepted",
        itemsKept: SUGGESTED.length,
        resolvedAt: new Date("2026-01-01T00:05:00Z"),
      });
      return { taskId, suggestionId: saved.id };
    },
    run: (ids) =>
      call(aiActions.rateBreakdownAction, { suggestionId: ids.suggestionId, rating: "4", feedback: "Helpful" }),
  },
];

describe.each(AI_ACTIONS)("$name", (action) => {
  it.each(TASK_ACTORS)("as %s, on their own task", async (kind) => {
    const setup = await actAs(kind);
    try {
      const ids = await action.fixture(setup.user?.id ?? (await insertUser(db)).id);
      const before = await aiSnapshot(ids);
      const mayDoIt = AI_OWNERS.includes(kind);

      expect(await action.run(ids)).toBe(mayDoIt ? "ok" : NOT_ALLOWED);

      const after = await aiSnapshot(ids);
      if (mayDoIt) {
        expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
      } else {
        // A refused request changed nothing: no suggestion recorded, none changed, no steps.
        expect(after).toEqual(before);
      }
    } finally {
      await setup.restore();
    }
  });

  it.each(TASK_ACTORS)("as %s, on another student's task or suggestion", async (kind) => {
    const setup = await actAs(kind);
    try {
      const stranger = await insertUser(db, { status: "active" });
      const ids = await action.fixture(stranger.id);
      const before = await aiSnapshot(ids);

      const result = await action.run(ids);

      // Someone who holds both keys is told "not found"; everyone else is stopped earlier, by the keys.
      expect(result).toBe(AI_OWNERS.includes(kind) ? "fail:not_found" : NOT_ALLOWED);
      expect(await aiSnapshot(ids)).toEqual(before);
    } finally {
      await setup.restore();
    }
  });

  it("as a student: ids that do not exist are 'not found'", async () => {
    const setup = await actAs("student");
    try {
      expect(await action.run({ taskId: randomUUID(), suggestionId: randomUUID() })).toBe("fail:not_found");
    } finally {
      await setup.restore();
    }
  });

  it("as admin: ids that do not exist give the same answer as any other refusal", async () => {
    const setup = await actAs("admin");
    try {
      expect(await action.run({ taskId: randomUUID(), suggestionId: randomUUID() })).toBe(NOT_ALLOWED);
    } finally {
      await setup.restore();
    }
  });

  it("as a student: bad ids are rejected as invalid input", async () => {
    const setup = await actAs("student");
    try {
      expect(await action.run({ taskId: "not-a-uuid", suggestionId: "not-a-uuid" })).toBe("fail:invalid_input");
    } finally {
      await setup.restore();
    }
  });
});

describe("AI-e: both keys are needed, one is not enough", () => {
  async function without(roleKey: string, permissionKey: string) {
    const grant = await grantRow(roleKey, permissionKey);
    await db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, grant.roleId), eq(rolePermissions.permissionId, grant.permissionId)));
    return async () => void (await db.insert(rolePermissions).values(grant));
  }

  it.each(["ai.use", "task.personal.manage"])("a student without %s is refused every AI action", async (missing) => {
    const restoreKey = await without("student", missing);
    const setup = await actAs("student");
    try {
      for (const action of AI_ACTIONS) {
        const ids = await action.fixture(setup.user!.id);
        const before = await aiSnapshot(ids);
        expect(await action.run(ids), action.name).toBe(NOT_ALLOWED);
        expect(await aiSnapshot(ids), action.name).toEqual(before);
      }
    } finally {
      await setup.restore();
      await restoreKey();
    }
  });
});

describe("tier 1: Admin never reaches a student's AI history", () => {
  it("Admin is refused by every AI action on a student's task and suggestion, and nothing changes", async () => {
    const student = await insertUser(db, { status: "active" });
    const setup = await actAs("admin");
    try {
      for (const action of AI_ACTIONS) {
        const ids = await action.fixture(student.id);
        const before = await aiSnapshot(ids);
        expect(await action.run(ids), action.name).toBe(NOT_ALLOWED);
        expect(await aiSnapshot(ids), action.name).toEqual(before);
      }
    } finally {
      await setup.restore();
    }
  });
});

describe("AI actions: the record rules, as the owner", () => {
  it("a Done task cannot be broken down, and the model is never asked (no suggestion is recorded)", async () => {
    const setup = await actAs("student");
    try {
      const task = await insertTask(setup.user!.id, {
        status: "done",
        startedAt: LONG_AGO,
        completedAt: new Date("2026-01-05T00:00:00Z"),
      });
      expect(await call(aiActions.requestBreakdownAction, { taskId: task.id })).toBe("fail:task_done");
      expect((await aiSnapshot({ taskId: task.id, suggestionId: "" })).suggestions).toHaveLength(0);
    } finally {
      await setup.restore();
    }
  });

  it("a step cannot be broken down", async () => {
    const setup = await actAs("student");
    try {
      const parent = await insertTask(setup.user!.id);
      const step = await insertTask(setup.user!.id, { parentTaskId: parent.id, title: "A step" });
      expect(await call(aiActions.requestBreakdownAction, { taskId: step.id })).toBe("fail:step_of_step");
    } finally {
      await setup.restore();
    }
  });

  it("asking twice in a row: the second is 'too soon' and records nothing", async () => {
    const setup = await actAs("student");
    try {
      const first = await insertTask(setup.user!.id);
      const second = await insertTask(setup.user!.id, { title: "Another task" });
      expect(await call(aiActions.requestBreakdownAction, { taskId: first.id })).toBe("ok");
      expect(await call(aiActions.requestBreakdownAction, { taskId: second.id })).toBe("fail:too_soon");
      expect((await aiSnapshot({ taskId: second.id, suggestionId: "" })).suggestions).toHaveLength(0);
    } finally {
      await setup.restore();
    }
  });

  it("the whole round trip: ask, save exactly as suggested (accepted), then rate", async () => {
    const setup = await actAs("student");
    try {
      const task = await insertTask(setup.user!.id);
      const asked = await aiActions.requestBreakdownAction(null, form({ taskId: task.id }));
      expect(asked?.ok).toBe(true);
      if (!asked?.ok || !asked.data) return;

      // Send the rows back exactly as received.
      const data = new FormData();
      data.set("taskId", task.id);
      data.set("suggestionId", asked.data.suggestionId);
      for (const [index, step] of asked.data.steps.entries()) {
        data.append("title", step.title);
        data.append("estimateMinutes", String(step.minutes));
        data.append("deadlineDate", step.deadlineDate);
        data.append("deadlineTime", step.deadlineTime);
        data.append("suggestedIndex", String(index));
      }
      const saved = await aiActions.saveBreakdownAction(null, data);
      expect(saved).toMatchObject({ ok: true, data: { outcome: "accepted", created: 4 } });

      expect(
        await call(aiActions.rateBreakdownAction, { suggestionId: asked.data.suggestionId, rating: "5", feedback: "" }),
      ).toBe("ok");
      const [row] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, asked.data.suggestionId));
      expect(row).toMatchObject({ outcome: "accepted", itemsKept: 4, rating: 5, model: "fake-model" });
    } finally {
      await setup.restore();
    }
  });

  it("a refused step list names the step: 'Step 2: Enter a title.'", async () => {
    const setup = await actAs("student");
    try {
      const task = await insertTask(setup.user!.id);
      const suggestion = await insertSuggestion(setup.user!.id, task.id);
      const data = saveForm({ taskId: task.id, suggestionId: suggestion.id });
      const titles = data.getAll("title");
      data.delete("title");
      data.append("title", String(titles[0]));
      data.append("title", "");
      data.append("title", String(titles[2]));
      const result = await aiActions.saveBreakdownAction(null, data);
      expect(result).toMatchObject({ ok: false, error: { code: "invalid_input", message: "Step 2: Enter a title." } });
    } finally {
      await setup.restore();
    }
  });
});
