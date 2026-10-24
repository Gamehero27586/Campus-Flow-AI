import "server-only";

// The 23 permission keys, defined once (docs/permissions.md §3).
// Eligible and default roles live here in code; the seed writes keys and default grants to the database.
// The Admin grid (Slice 10) can only tick eligible cells. Locked keys can never be removed from Admin.

export const ROLE_KEYS = ["student", "faculty", "admin"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export type PermissionDefinition = {
  key: string;
  module: string;
  description: string;
  /** Roles that may hold this key. Anything else is refused by the server. */
  eligible: readonly RoleKey[];
  /** Roles granted the key by the seed. Always a subset of `eligible`. */
  defaults: readonly RoleKey[];
  /** Locked keys cannot be removed from Admin. */
  locked?: true;
};

export const ROLE_DEFINITIONS: Record<RoleKey, { name: string; description: string }> = {
  student: {
    name: "Student",
    description: "Plans personal work, joins classes and submits assignments.",
  },
  faculty: {
    name: "Faculty",
    description: "Runs classes, posts assignments and grades submissions.",
  },
  admin: { name: "Admin", description: "Approves accounts and manages roles and permissions." },
};

export const PERMISSIONS = [
  // Admin module
  {
    key: "admin.users.manage",
    module: "Admin",
    description:
      "See the user list, approve or reject accounts, deactivate or reactivate, create reset links, reset a rejected account.",
    eligible: ["admin"],
    defaults: ["admin"],
    locked: true,
  },
  {
    key: "admin.users.assign_role",
    module: "Admin",
    description: "Set a user's role, including making another user an Admin.",
    eligible: ["admin"],
    defaults: ["admin"],
    locked: true,
  },
  {
    key: "admin.roles.edit_permissions",
    module: "Admin",
    description: "Edit the permission grid (eligible cells only).",
    eligible: ["admin"],
    defaults: ["admin"],
    locked: true,
  },
  {
    key: "admin.audit.view",
    module: "Admin",
    description: "Read the audit log.",
    eligible: ["admin"],
    defaults: ["admin"],
  },
  {
    key: "admin.override",
    module: "Admin",
    description:
      "View any class and team read-only; transfer class ownership; transfer the team creator.",
    eligible: ["admin"],
    defaults: ["admin"],
    locked: true,
  },
  // Everyone
  {
    key: "dashboard.view",
    module: "Dashboard",
    description: "The dashboard. Its content follows the role.",
    eligible: ["student", "faculty", "admin"],
    defaults: ["student", "faculty", "admin"],
  },
  // Classes
  {
    key: "class.create",
    module: "Classes",
    description: "Create a class (the creator becomes the owner).",
    eligible: ["faculty"],
    defaults: ["faculty"],
  },
  {
    key: "class.view",
    module: "Classes",
    description: "See the classes you belong to (Admin: all, through admin.override).",
    eligible: ["student", "faculty", "admin"],
    defaults: ["student", "faculty", "admin"],
  },
  {
    key: "class.manage",
    module: "Classes",
    description:
      "Edit or archive a class; add or remove co-teachers; transfer ownership (owner only).",
    eligible: ["faculty"],
    defaults: ["faculty"],
  },
  {
    key: "class.members.manage",
    module: "Classes",
    description:
      "Roster, join requests, enrollment codes, removing students, leave requests and the approval setting.",
    eligible: ["faculty"],
    defaults: ["faculty"],
  },
  {
    key: "class.join",
    module: "Classes",
    description: "Send a join request with a code; ask to leave a class.",
    eligible: ["student"],
    defaults: ["student"],
  },
  // Assignments, submissions, grading
  {
    key: "assignment.manage",
    module: "Assignments",
    description:
      "Post, edit, change recipients and dates, close, cancel and grant resubmission on assignments.",
    eligible: ["faculty"],
    defaults: ["faculty"],
  },
  {
    key: "assignment.view",
    module: "Assignments",
    description:
      "See assignments addressed to you (Student) or in your classes (Faculty); Admin read-only.",
    eligible: ["student", "faculty", "admin"],
    defaults: ["student", "faculty", "admin"],
  },
  {
    key: "submission.create",
    module: "Assignments",
    description: "Submit and resubmit your own work.",
    eligible: ["student"],
    defaults: ["student"],
  },
  {
    key: "submission.view",
    module: "Assignments",
    description:
      "See submissions: your own (Student), your class (Faculty), any read-only (Admin).",
    eligible: ["student", "faculty", "admin"],
    defaults: ["student", "faculty", "admin"],
  },
  {
    key: "submission.grade",
    module: "Assignments",
    description: "Give or edit marks and comments.",
    eligible: ["faculty"],
    defaults: ["faculty"],
  },
  // Tasks, teams, files
  {
    key: "task.personal.manage",
    module: "Tasks",
    description: "Create and manage your own personal tasks and subtasks.",
    eligible: ["student", "faculty"],
    defaults: ["student"],
  },
  {
    key: "team.create",
    module: "Teams",
    description: "Create a team.",
    eligible: ["student"],
    defaults: ["student"],
  },
  {
    key: "team.use",
    module: "Teams",
    description:
      "See your teams and invitations; create, edit and assign tasks in teams you are an active member of (Admin: view only).",
    eligible: ["student", "admin"],
    defaults: ["student", "admin"],
  },
  {
    key: "file.upload",
    module: "Files",
    description:
      "Upload a file. What it may be attached to is decided by the record it belongs to.",
    eligible: ["student", "faculty"],
    defaults: ["student", "faculty"],
  },
  // Trackers and AI
  {
    key: "tracker.personal.view",
    module: "Trackers",
    description: "Your own Growth Tracker.",
    eligible: ["student", "faculty"],
    defaults: ["student"],
  },
  {
    key: "tracker.class.view",
    module: "Trackers",
    description: "The class tracker: assigned versus submitted (Admin: view only).",
    eligible: ["faculty", "admin"],
    defaults: ["faculty", "admin"],
  },
  {
    key: "ai.use",
    module: "AI",
    description: "AI breakdown on your own tasks and AI suggestions in your own weekly summary.",
    eligible: ["student", "faculty"],
    defaults: ["student"],
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
