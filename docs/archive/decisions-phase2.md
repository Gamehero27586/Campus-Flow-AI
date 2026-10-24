# CampusFlow AI: decisions log

The single place that says **what has been decided and which document wins**. Written at the end of Phase 2. When any document disagrees with this file, this file wins. When two documents disagree and this file is silent, the one with the higher version number or later date wins, and the conflict should be reported to the owner.

## 1. Which document is current

| Topic | Current document |
|---|---|
| Scope, goals, slices, AI spec, Growth Tracker spec | `mvp-scope-v2.md` (see section 3 for parts that are superseded) |
| Tables and columns | `data-model-draft-v0.4.md` and `er-diagram.png` |
| Permissions, roles, locked rules | `permission-model-draft-v0.3.md` |
| Folders, conventions, routes, scripts | `folder-structure-draft-v0.3.md` |
| Business flows, status rules, metrics definitions | `data-flows-draft.md` (v0.3) |
| Screens | The wireframe canvas (12 screens; link kept by the owner) |
| Schedule | `campusflow_plan.xlsx` (needs re-baselining, see section 4) |

Older files (`data-model-draft.md`, `-v0.2`, `-v0.3`, `permission-model-draft.md`, `-v0.2`, `folder-structure-draft.md`, `mvp-scope.md`) are history. Do not build from them.

## 2. Decisions (all confirmed by the owner)

### Stack and tooling
- Next.js (App Router, `src/`, TypeScript strict), PostgreSQL on Neon, Drizzle ORM (generate and migrate, not push after Slice 0), Better Auth (email and password, Google), Tailwind and shadcn/ui, Zod, react-hook-form, Vitest and Playwright, ESLint and Prettier.
- **npm** is the package manager (the owner uses Windows and npm daily).
- Local AI: Llama 3.2 3B through Ollama on the owner's laptop. No third-party AI API. No fine-tuning.
- Files are stored on local disk first behind a storage interface. Cloudinary is evaluated before the upload slice. Allowed types: PDF, JPG, PNG. Size cap is a setting (default 10 MB).
- Items marked **[Verify]** in the documents must be checked against current library documentation when the code is written.

### Accounts and roles
- Three fixed roles: Student, Faculty, Admin. Admin approves new accounts and assigns roles. An Admin page edits which permission keys each role has (32 keys, 3 locked to Admin).
- Every user chooses a **username** at first sign-in (also Google sign-ups). A password is optional for Google users. Usernames and emails are used for exact-match lookup only (no browsable list of users).
- At the same first sign-in screen the person may pick a **requested role** (Student or Faculty) or leave it blank (for example a future Admin). It is a hint shown to the Admin on the approval page; the Admin can change it and must choose a role to approve. Admin is never offered at sign-up. The Access and Admin users wireframes do not show this field yet; the documents decide.
- Permissions are read per request, never stored in the login token.

### Tasks
- One `tasks` table with context personal, assignment or team. Subtasks are one level deep. Status values `todo`, `in_progress`, `done`; the label is "To Do".
- Assignment tasks cannot be marked done by hand or reopened by the student. First submission completes the task. Faculty allow another submission with `resubmission_until`.
- Lateness is **calculated**, never stored.
- Deleted tasks: a task that was already completed, or already past its deadline, when deleted still counts in metrics; a task deleted while open and before its deadline does not.

### Classes, teams
- Joining a class by code creates a **request**; the teacher approves or declines (per-class setting `requires_approval`, default on). Declined or removed students stay outside until the teacher approves or reconsiders. Direct add by username is a later feature.
- Teams are independent of classes. Join by invitation (exact email or username) and accept.

### Metrics and Growth Tracker
- Timeframes are **day, week (Monday to Sunday) and month**, in the user's timezone. The word "period" is not used (students may confuse it with a lecture period).
- Day view shows counts only. Week and month show rates, trends (only with at least 10 completed tasks) and the AI summary.
- Subtasks are not counted. On-time = completed at or before the deadline; tasks with no deadline are excluded from on-time.
- Weekly AI summary: every number in the text must exist in the input metrics.

### Visibility
- Tier 1, personal data (personal tasks, personal tracker, AI history): never visible to anyone else, including Admin.
- Tier 2, academic records (assignments, submissions, grades, rosters): visible to the class faculty and the student concerned; Admin only by an audited override.
- Tier 3, teams: active members only.

## 3. Where `mvp-scope-v2.md` is superseded

Known cases (not exhaustive; Opus review should look for more):

| mvp-scope-v2 says | Now |
|---|---|
| Classes, role matrix and student story: a student joins a class directly with a code | A code creates a join request; the teacher approves or declines |
| Roles section: admins see class metadata only and cannot open submission files (default) | Three visibility tiers above; Admin reaches academic records only by an audited override |
| Teams section: the creator adds members to a team | Creator invites by exact email or username; the invitee accepts or declines |
| Business rules and Growth Tracker: "period", weekly and monthly views | "Timeframe", with day, week and month views (day is counts only) |
| Business rules: deleted tasks (earlier wording) | Counting rule in section 2 above |

## 4. Still open

1. File size cap and the final storage provider (decide before the upload slice).
2. "Former member" handling for team tasks (data model rule 7).
3. Verification of Better Auth details: extra user fields, username support, session revocation on deactivation, current Next.js `proxy.ts` behaviour.
4. The schedule spreadsheet is out of date: Phases 0 to 2 were finished much faster than planned. Re-baseline it after the Opus review.
5. Direct add of a student by username (later feature), team join codes (later), external calendar sync (later).

## 5. What Phase 2 produced

Data model v0.4 (now including `users.requested_role`) with ER diagram, permission model v0.3, folder structure v0.3, data flows v0.3, twelve wireframe screens, this log, `CLAUDE.md` (for the repo root) and the Opus review prompt.
