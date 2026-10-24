# CampusFlow AI: decisions log

Version 1.0, 24 Oct 2026. Rewritten after the Opus review of the Phase 0 to 2 pack. **When any document disagrees with this file, this file wins.** When two documents disagree and this file is silent, stop and ask the owner; do not guess.

## 1. Which document is current

| Topic | Current document |
|---|---|
| Goals, scope, user stories, build slices | `mvp-scope.md` (v3) |
| Tables, columns, constraints | `data-model.md` (v0.5) and `er-diagram.png` / `.svg` (v0.5) |
| Roles, permission keys, relationship rules, Admin | `permissions.md` (v0.4) |
| Folders, conventions, routes, scripts | `folder-structure.md` (v0.4) |
| Business flows, status rules, **metric definitions** | `data-flows.md` (v0.4). The only place metrics are defined |
| Colours and UI tokens | `color-palette.md` (v2) |
| Working rules for Claude | `CLAUDE.md` (copy to the repository root in Slice 0) |
| Screens | The wireframe canvas (link kept by the owner). Where it disagrees with the documents, the documents win |
| Schedule | `campusflow_plan-v3.xlsx` in the `Campus-Flow AI Workspace` folder (re-baselined 24 Oct 2026; the older `campusflow_plan.xlsx` is history) |

Everything in `docs/archive/` is history, including the Opus review (`archive/opus-review.md`). **Do not build from it.** Section 14 says which review items were applied.

## 2. Stack and tooling

- Next.js 16 (App Router, `src/`, TypeScript strict), PostgreSQL, Drizzle ORM with the **`pg` (node-postgres) driver** (never `neon-http`, which has no interactive transactions), Better Auth (email and password, Google), Tailwind and shadcn/ui, Zod, react-hook-form, Vitest, Playwright, ESLint, Prettier.
- Package manager **npm**. The owner works on Windows with PowerShell.
- Database: **Neon** (free tier) for development and the friends test; a **local PostgreSQL** copy is kept as the demo fallback. Migrations with `drizzle-kit generate` and `migrate`, committed, never edited after being applied.
- Tests: Vitest for unit, policy and metric tests; Playwright for 3 end-to-end flows. Test database decided in Slice 0 (first candidate: PGlite; check that the metric SQL's time zone functions work).
- CI: a GitHub Actions workflow runs `typecheck`, `lint` and `test` on every push.
- Local AI: Llama 3.2 3B through Ollama on the owner's laptop. No third-party AI API. No fine-tuning.
- Files: **local disk only** in the MVP, behind a storage interface (`upload`, `stream`, `delete`). Cloudinary is a later option, not part of the MVP. Allowed types PDF, JPG, PNG; cap `MAX_FILE_SIZE_BYTES` = 10 MB; at most 20 files per assignment or submission.
- No email is sent in the MVP (no verification, no reset emails). See section 3.

## 3. Accounts, roles and permissions

- Sign-up with email and password or Google. Every new account is `pending` and sees only the welcome and waiting screens.
- **Welcome screen (once):** every user chooses a **username** (3 to 20 characters: letters, numbers, dot, underscore; stored lower case; unique) and optionally a **requested role** (Student or Faculty). Until a username is set, the user is sent to `/welcome` before anything else. **Usernames cannot be changed after they are set** (Better Auth `immutableUsername`).
- The Admin approves (choosing the role, pre-filled with the request) or rejects. Admin is never offered at sign-up.
- **First admin:** the owner signs up normally, then runs `npm run admin:promote -- <email>` once. It refuses if an active admin exists and writes an audit row. **No runtime code ever promotes anyone by email.**
- **Email ownership is not proven in the MVP.** The approval page shows whether the email is verified (Google sets it) and the Admin checks with the person before approving an unverified account. Google logins never merge silently into an existing email-and-password account (`accountLinking.disableImplicitLinking: true`).
- **Forgotten password:** the Admin creates a one-time reset link from the Users page (expires after 1 hour, audited) and passes it on. A rejected account can be reset to pending by the Admin.
- **App-owned user fields** (`status`, `role_id`, `approved_by`, `approved_at`, `rejection_reason`, `is_seed`, `requested_role`, `timezone`) are Better Auth `additionalFields` with **`input: false`**. They are written only by our own server code. A test proves `update-user` cannot change them.
- Three fixed roles: Student, Faculty, Admin. **23 permission keys**, each with a list of **eligible roles**. The Admin grid can only tick eligible cells; four Admin keys are locked. Details in `permissions.md` §3.
- Permissions are read per request, never stored in the session. Better Auth `session.cookieCache` stays **off**. Deactivating a user deletes their session rows in the same transaction.
- **Role changes are refused** while the user is faculty of an active class or a member of an active class or team. Transfer or remove those first.

## 4. Tasks

- One `tasks` table with context personal, assignment or team. Subtasks are one level deep and copy the parent's context, assignee, `assignment_id` and `team_id`.
- One assignment task per student: unique (assignment_id, assignee_id) **for top-level tasks only** (partial index).
- Status `todo`, `in_progress`, `done` (label "To Do"). `completed_at` is set exactly when status is done (CHECK).
- When a task is completed without ever being started, the app asks once "When did you start?" (optional); the answer sets `started_at`. "Start" is the obvious first button on every task card.
- Assignment tasks cannot be marked done by hand or reopened by the student. The first submission completes the task **and any open subtasks**. Faculty allow another submission with `resubmission_until`.
- Only the **assignee** changes a team task's status or moves its deadline. Any active member can edit, reassign or delete it.
- Lateness is **calculated**, never stored.
- Soft delete records a `deleted_reason`: `user_deleted`, `recipient_removed` or `assignment_cancelled`.

## 5. Classes and assignments

- A class has one owner and optional **co-teachers** (in the MVP, Slice 6). The owner adds a co-teacher by exact username or email of an active Faculty user.
- Joining by code creates a **request**; the teacher approves or declines. Per-class setting `requires_approval` (default on). Declined or removed students stay outside until the teacher reconsiders. A student **asks to leave** and the teacher decides.
- Assignments go to all active members or selected members. Later joiners do not receive earlier assignments automatically; faculty can add them.
- Closing uses one column, `closes_at`. "Close now" sets it to the current time.
- `max_marks` is locked once any grade exists. Attachments can be added and removed until the first submission, then only added.
- An assignment can be cancelled only while it has no submissions. Once it has submissions, faculty close it instead.

## 6. Submissions and files

- Each submission version is kept; the latest is graded; the first submission time decides on-time. One grade per task.
- A file has exactly one parent: `files.assignment_id` or `files.submission_id` (no link tables).
- Uploads go to `POST /api/uploads` as the raw file body, read as a stream with a byte counter and a content-signature check. The upload and download routes are excluded from the `proxy.ts` matcher (Next.js truncates bodies over 10 MB there).
- Downloads only through `/api/files/[fileId]` after the parent's policy passes. PDFs and images open inline inside a CSP sandbox (if a browser's PDF viewer fails under the sandbox, PDFs are downloaded instead); the file name in the header is encoded.

## 7. Teams

- Teams are independent of classes. The creator invites by exact email or username; the invitee accepts or declines. Only **active Students** can be invited. The reply is the same whether or not the user exists.
- Removed members' tasks stay assigned for history, are shown as "former member", and any active member can reassign them.
- Team join codes are a later feature.

## 8. Metrics and Growth Tracker

- Timeframes: day, week (Monday to Sunday), month, in the user's time zone. The word "period" is not used.
- Counted: top-level tasks in all three contexts assigned to the user. Deleted tasks count only when `deleted_reason = user_deleted` and they were already completed or past their deadline when deleted. Assignment tasks from a class the student left or was removed from count only if they were due before that.
- For the **current** timeframe, the due set is tasks due between its start and now.
- Consistency is **monthly only**. A week belongs to the month that contains its Thursday. Denominator: weeks with at least one due task; at least 2 such weeks are needed.
- Trend minimum: **5** completed tasks for a week, **10** for a month, in both the current and the previous timeframe. The weekly AI summary needs at least 3 due tasks. These numbers live in `src/config/`.
- Day view shows counts only.
- All definitions: `data-flows.md` §7.

## 9. AI

- Breakdown: JSON schema through Ollama `format`, Zod validation, one retry, then a clear fallback. The student edits before anything is saved. Code assigns dates.
- **History-only estimate hint:** the median active time of the user's last completed tasks in that category (at least 3). There is no separate AI estimate call; AI minutes appear only on breakdown subtasks.
- **Weekly summary is template-first:** code writes every sentence that contains a number. The model writes at most three short suggestions, and any output containing a digit is rejected.
- All AI text is shown as plain text. The model is kept loaded (`keep_alive`) and warmed up when the app starts.

## 10. Visibility tiers and Admin

- **Tier 1, personal** (personal tasks, subtasks of assignment tasks, personal tracker, AI history): owner only. Never Faculty, never Admin.
- **Tier 2, academic** (classes, rosters, assignments, parent assignment tasks, submissions, files, grades, class trackers): class Faculty and the student concerned. **Admin may view them read-only.**
- **Tier 3, teams:** active members. Admin may view read-only.
- **Admin writes are limited** to: account approval and status, roles, the permission grid, reset links, **transfer class ownership** and **transfer team creator**. Admin cannot edit grades, assignments, submissions, rosters or team tasks.
- Every Admin view of a class or team page shows a "Viewing as admin" banner. Opening a submission file as Admin is written to the audit log.

## 11. UI

- Colours, tokens and contrast rules: `color-palette.md` v2. Light mode only in the MVP. Components use theme tokens, never raw hex values.

## 12. Hosting, demo and friends test

- The app, the database connection and Ollama run on the owner's laptop. For the friends test (1 to 2 weeks) the laptop is reachable through a free tunnel (for example Cloudflare Tunnel) while it is switched on. Google OAuth redirect URLs must include the tunnel address.
- The demo and the friends test run a production build (`npm run build` then `npm start`), never `npm run dev` (Better Auth rate limits only work in production mode).
- The night before a demo: `pg_dump` from Neon into the local PostgreSQL and rehearse with the network off.

## 13. Build plan

Slices and hours are in `mvp-scope.md` §11. Two checkpoints:
- **Checkpoint A** (after Slice 5): a student can plan tasks, break them down with AI and see their Growth Tracker.
- **Checkpoint B** (after Slice 8, the first university demo): the full faculty-to-student loop as well.

## 14. Outcome of the Opus review (24 Oct 2026)

| Review IDs | Outcome |
|---|---|
| B1 to B6 | Applied (B1 by `input: false`) |
| S1 | Applied with option (b): no email in the MVP |
| S2 to S16 | Applied. S4: role changes are refused while relationships exist |
| C1 to C8 | Applied |
| G1 to G19 | Applied. G5 thresholds 5, 10 and 3. G7 Admin reset links. G13 laptop plus tunnel |
| P2 (narrow Admin override) | Applied |
| P3 (eligible roles, 23 keys) | Applied |
| P5 (no Cloudinary), P6 (one parent per file, single `closes_at`), P7 (template summary) | Applied |
| P1 (simplify teams), P4 (simplify join and leave), P8 (trim metrics) | **Rejected by the owner.** Teams, join requests, leave requests and all metrics stay as designed |
| P9 (Google later), P10 (co-teachers later) | **Rejected by the owner.** Both stay in the early slices |
| D1 to D3, D5, D6 | Applied in `color-palette.md` v2 |
| D4 (coral versus teal hierarchy) | Open, owner's design choice (section 15) |
| New slice order and two checkpoints | Applied |

Choices Opus made where the owner had not answered; the owner may change any of them: `input: false` instead of a separate profile table; refusing role changes; immutable usernames; the 5, 10 and 3 thresholds; faculty being **eligible** (off by default) for personal tasks, the personal tracker and AI.

## 15. Still open

1. **D4:** should secondary buttons stay coral (with dark text), or become teal outline with coral kept as the accent? Decide before Slice 3, when the first real screens are built.
2. The wireframes do not yet show the requested-role field, the "When did you start?" prompt, the email-verified badge or the reset-link action. The documents decide; update the canvas when convenient.
3. Later features: direct add of a student by username, team join codes, calendar sync, email sending, Cloudinary, per-student deadline extensions, CSV import.
