# CampusFlow AI: Opus review of the Phase 0 to 2 planning pack

Reviewed 24 Oct 2026 by Claude (Opus), as asked in `opus-review-prompt.md`. Nothing in the planning documents has been changed. Every item below is a **proposal**. You approve, change or reject each one by its ID (for example "approve B1 to B6, reject P2").

**What I read:** `decisions.md`, `mvp-scope-v2.md`, `data-model-draft-v0.4.md`, `er-diagram.png`, `permission-model-draft-v0.3.md`, `folder-structure-draft-v0.3.md`, `data-flows-draft.md` (v0.3), `CLAUDE.md`, `color-palette.md`, `campusflow_plan.xlsx` and the Git status of the repo.
**What I could not read:** the wireframe canvas. The prompt still says "(paste the canvas link here)", so no finding below checks the screens. Send the link and I will add a wireframe pass.

Labels: **[Unsure]** means I am not certain and you should check. **[Checked]** means I checked current documentation today (sources at the end). Effort is my estimate in focused hours, not a measurement.

---

## 1. Verdict

**Not yet. Fix about a day's worth of documents first, then it is ready to build from.**

The design is unusually careful for a final-year project. The privacy tiers, the five-step check pipeline, calculated lateness, the centralised timestamp rules and the AI safety rules are all sound, and you can defend them in a viva. The problems are of three kinds:

1. **Six blockers that would make Sonnet build something wrong on day one.** One schema bug (subtasks of an assignment break a unique index). One contradiction (`username` is required but is chosen after Google sign-up). A database driver choice that the transaction flows depend on. A Better Auth setting without which any user could approve themselves. An undefined first-admin bootstrap. And document hygiene: old versions and stale cross-references would let Sonnet read the wrong file.
2. **A design heavier than one person can finish by the first demo.** At about 18 realised hours a week, you have roughly 250 hours before 1 February 2027. The scope needs 310 to 470 hours, plus report writing that no estimate includes. The novel parts (AI breakdown, Growth Tracker) are built last, at slices 8 to 10, so they are the parts most likely to be missing at the first demo.
3. **Gaps in metric definitions and lifecycle rules.** These are exactly the "permissions, deadlines, metrics, visibility" areas where `CLAUDE.md` tells Sonnet to stop and ask. Unresolved, they would stall each slice.

---

## 2. Findings

Severity: **Blocker** = fix before Slice 0 or the slice named. **Should fix** = fix before the slice that touches it. **Nice** = optional.

### 2.1 Blockers

| ID | Finding | File and section | Proposed change | Effort |
|---|---|---|---|---|
| B1 | **Self-approval through Better Auth.** Better Auth exposes a public `update-user` endpoint. If `status`, `role_id`, `approved_by`, `approved_at`, `rejection_reason` and `is_seed` are added as ordinary `additionalFields`, a pending user could send `{ status: "active", roleId: <admin role id> }` and approve themselves, skipping every rule in the permission model. **[Checked]** Better Auth's `input: false` makes a field server-owned. | data model §1 `users`; folder structure §2 "Auth" | Declare every app-owned user field with `input: false`. Only `requested_role` and `timezone` may be user-settable, and only through our own actions. Add a test that calls `update-user` with `status` and `roleId` and checks that nothing changed. Add the rule to `CLAUDE.md`. (Alternative: keep app fields in our own `user_profiles` table that Better Auth never touches. That is safer by construction but adds a join. Your choice.) | 1 to 2 h |
| B2 | **`users.username` is "req" (NOT NULL) but is chosen after first sign-in.** With Google, Better Auth creates the user row before the welcome screen, so the insert fails. **[Checked]** The username plugin does not set a username for social sign-ups. | data model §1 `users`; decisions §2 "Accounts" | Make `username` nullable and unique. Add a "profile incomplete" gate: a signed-in user without a username is sent to `/welcome` before anything else, including `/pending`. Allow `/welcome` for pending users in pipeline step 2 (today only sign-out and the waiting page are allowed). | 1 h |
| B3 | **The unique index (assignment_id, assignee_id) breaks subtasks.** A subtask must have "the same context and assignee" as its parent, and context = assignment requires `assignment_id`. So a student's first subtask of an assignment task (including every AI breakdown) violates the unique index. | data model §4 `tasks` constraints | Make the index partial: `UNIQUE (assignment_id, assignee_id) WHERE parent_task_id IS NULL`. State whether subtasks copy `assignment_id` and `team_id` (I suggest yes, which keeps the CHECKs simple). Make every faculty and tracker query filter `parent_task_id IS NULL`. Add a test. | 0.5 h |
| B4 | **The database driver is not chosen, and the flows need real transactions.** The submit flow uses `SELECT ... FOR UPDATE` inside a transaction. **[Checked]** Drizzle's `neon-http` driver does not support interactive transactions. You need the WebSocket `neon-serverless` driver or `node-postgres`. | folder structure §2 "Database"; data flows §4.1 | Use `node-postgres` (`pg`). The app runs as one long-lived Node process on your laptop, and `pg` works the same against Neon and a local Postgres, which helps testing and the demo (see G13). Record the choice in `decisions.md`. | 0.5 h |
| B5 | **The first-admin bootstrap is undefined, and with no email verification it can be hijacked.** The scope says the seed "reads an admin email from an environment variable". If this is done at runtime (for example "promote whoever signs up with ADMIN_EMAIL"), then anyone who registers that email first becomes Admin, because nobody checks email ownership. | mvp-scope §3 point 4; folder structure §4 "Seeds" | Make it a one-time CLI step: you sign up normally, then run `npm run admin:promote -- <email>`. It refuses if an active admin already exists and writes an audit row. No runtime code ever promotes by email. | 1 h |
| B6 | **Document hygiene: Sonnet can read the wrong file.** (a) Three versions of most documents sit side by side in `docs/`, and the newest data-flows file has *no* version in its name while the older one is called "v0.2". (b) The permission, folder and flows documents still point to `mvp-scope.md`, `data-model-draft.md` and so on (the old files). (c) Only `mvp-scope-v2.md` is committed. Every other document is untracked in Git. (d) The scope and Slice 0 say the repo is `C:\dev\campusflow`, but the real repo is `C:\dev\Campus-Flow-AI`. (e) `mvp-scope-v2.md` §13 and permission model §10 still list open **[Confirm]** items that were confirmed later, and `decisions.md` does not close all of them (for example the 20-file cap, the fixed category list, no email verification, and personal tasks being student-only). (f) `decisions.md` §3 does not say that scope §6 (the permission matrix) and §7 (user stories) are superseded. They disagree with permissions v0.3: for example, the scope gives Admin no AI and no personal tasks, while v0.3 gives Admin all 32 keys. | all documents | Move old versions to `docs/archive/`. Rename the current files without "draft" or version suffixes (`data-model.md`, `permissions.md`, `folder-structure.md`, `data-flows.md`, `mvp-scope.md`) and keep the version in the header. Fix cross-references. Close every [Confirm] in `decisions.md` with a one-line answer. Fix the repo path. Commit everything. | 2 to 3 h |

### 2.2 Security risks

| ID | Finding | File and section | Proposed change | Effort |
|---|---|---|---|---|
| S1 | **Email ownership is never proven, and Google logins link to existing accounts automatically.** **[Checked]** Better Auth's account linking is on by default and links a Google login to an existing user with the same email when Google says the email is verified. Attack: someone signs up with email and password as `realteacher@college.edu` and asks for Faculty. You cannot tell from the approval page that it is not really them. If you approve, they act as that teacher. If the real teacher later signs in with Google, both people share the account, and the impostor keeps a working password. | mvp-scope §3 point 5; decisions §2 | Pick one. (a) Require email verification for email and password sign-ups (needs an email sender, see G7). (b) Without email: show "email not verified" on the approval page, only approve such accounts after checking with the person, and set `accountLinking.disableImplicitLinking: true` so a Google login never silently merges. For the demo with friends, (b) is enough. | 2 to 6 h |
| S2 | **Admin holds student-only keys, and the override list includes submissions.** Admin has `submission.create`, `class.join`, `class.leave.request`, `task.personal.manage`, `ai.*`, `dashboard.student.view` and `tracker.personal.view`. §5 says the override passes the relationship check for "submissions". Implemented literally, Admin could submit work for a student, which §4 says must not happen. Admin joining a class as a student, or getting three dashboards on one `/dashboard` route, is also undefined. | permissions §3, §4, §5; folder structure §5 `/dashboard` | Admin default grants = the admin keys plus the faculty-type keys the override needs. Remove the student-only keys from Admin. Write in §5 that the override never applies to `submission.create`, to status changes on a student's task, or to tier 1. | 1 h docs, saves tests |
| S3 | **The editable grid can create states the code does not expect.** Admin can grant `class.create` to Student (but `class_faculty` requires the faculty role, so creation fails or leaves an ownerless class), `submission.grade` to Student, `task.personal.manage` to Faculty (the scope says personal tasks are student-only) and `team.create` to Faculty (team rules assume students). Each combination is a new behaviour to define and test. | permissions §3, §6 | Add `eligibleRoles` for each key in `permission-keys.ts`. The grid only allows ticking eligible cells, and the server refuses others. The grid stays editable and data-driven, which is still good viva material, but there are far fewer combinations. | 2 h, saves 10+ h of tests |
| S4 | **Changing a user's role leaves old relationships in place.** Demote a Faculty to Student and their `class_faculty` rows remain. Promote a Student to Faculty and their `class_members` and `team_members` rows remain. A demoted class owner leaves the class without a usable owner. | permissions §6; data model §2 | Rule: a role change is refused while the user is owner or co-teacher of an active class (transfer first), or ends their memberships in the same transaction and writes an audit row. Pick one and test it. | 2 to 3 h |
| S5 | **Next.js 16 `proxy.ts` silently truncates large request bodies.** **[Checked]** When a request passes through `proxy.ts`, Next.js buffers the body only up to `proxyClientMaxBodySize`, which defaults to 10 MB, and the request continues with a *partial* body and no error. A 10 MB file plus the multipart wrapper is over 10 MB, so uploads near the cap would be stored corrupted. | folder structure §3 `proxy.ts`; data flows §5.1 | Exclude the upload and download routes from the proxy `matcher` (the routes do their own checks anyway). Add a test that uploads a file just under the cap and compares checksums. | 0.5 h |
| S6 | **"Stop an oversized file early" will not happen with `request.formData()`.** It reads the whole body into memory first. | data flows §5.1 step 3 | Send the raw file as the request body (`fetch(url, { body: file })`) with the purpose and target in the query string. Read `request.body` as a stream and count bytes. Stop as soon as the cap is passed, and sniff the first bytes for the PDF, JPEG or PNG signature. This is simpler than a multipart parser and really does stop early. | 1 h |
| S7 | **File download headers.** `original_name` goes into `Content-Disposition`. An unescaped name with quotes or line breaks can corrupt the header. | data flows §5.2 | Encode the name (RFC 6266 `filename*=UTF-8''...`) and strip control characters. Also send `Content-Security-Policy: sandbox; default-src 'none'` and `Cache-Control: private, no-store`. Decide whether PDFs and images open **inline** (faculty will grade dozens of PDFs, and downloading each one is painful). Inline is acceptable with the CSP sandbox header. | 1 h |
| S8 | **Data leaks through Server Component props.** Passing a whole Drizzle row (for example a `users` row with email and rejection reason) to a Client Component puts every column in the page HTML. The documents never mention this. | `CLAUDE.md` "Structure" | Rule: queries select only the columns the screen needs and return plain objects (DTOs). Never pass a raw row to a Client Component. | 0 h, rule only |
| S9 | **Auth checks only in a layout are not enough.** In the App Router, a layout does not run again on every client-side navigation, and server actions never run layouts. | `CLAUDE.md`; permissions §7 | Rule: every page's data function and every action calls the check itself. Layouts may redirect for convenience only. | 0 h, rule only |
| S10 | **Session cache and deactivation.** **[Checked]** If Better Auth's `session.cookieCache` is turned on, revoked sessions keep working until the cache expires. Core Better Auth has no "revoke all sessions of another user"; the admin plugin does, but it brings its own `role` and `banned` fields that overlap with our model. | permissions §6 rule 7; decisions §4 item 3 | Do not enable `cookieCache`. In the deactivate command's transaction, delete that user's rows from Better Auth's `session` table (a documented exception to "never touch Better Auth tables"). Pipeline step 2 already reads `users.status` on every request, so deactivation takes effect at once even without this. This closes open item 3. | 1 h |
| S11 | **Rate limits are off in development and in memory only.** **[Checked]** Better Auth rate-limits only in production by default (sign-in: 3 requests per 10 s), using memory. The join-code limit (5 per 10 minutes) has no storage defined. | data flows §6 | Run the demo and the friends test with `npm run build && npm start`, never `npm run dev`. Use one small in-memory limiter module (`src/server/rate-limit.ts`) for join codes, team invites and AI. That is fine for one process on one laptop; write that assumption down. | 1 h |
| S12 | **Team invites by exact email reveal who has an account,** and anyone can send invites to anyone, Faculty and Admin included. **[Checked]** The username plugin's `is-username-available` endpoint also reveals usernames, and its docs suggest disabling it. | data model §4 rule 7; data flows §6 | Return the same message whether or not the user exists ("If this person has an account, they will see your invitation"). Only active Students can be invited. Rate-limit invites. Disable `is-username-available` and check availability inside our own welcome action instead. | 1 h |
| S13 | **AI output rendering.** The documents protect the prompt but not the display. | `CLAUDE.md` "AI rules" | Rule: AI text is always rendered as plain text. No `dangerouslySetInnerHTML`, and no Markdown renderer that allows HTML. | 0 h |
| S14 | **`audit_logs` is "append-only" only by convention.** | data model §1 | Add a database trigger that rejects UPDATE and DELETE on `audit_logs` (and `task_events`). It is cheap, it shows tamper resistance in the viva, and it stops a careless migration or seed. | 1 h |
| S15 | **Dependency and secret hygiene is not written down.** React Server Components had a critical remote code execution bug in December 2025 (CVE-2025-55182) that affected Next.js. | `CLAUDE.md` "Security rules" | Rules: never put a secret in a `NEXT_PUBLIC_` variable; `env.ts` imports `server-only`; keep Next.js on the latest patched minor version; turn on GitHub Dependabot alerts; run `npm audit` at each slice end. | 0.5 h |
| S16 | **Phone photos carry GPS location data (EXIF).** Students uploading photos of written work may share their location with faculty. | scope §4.4 | Nice to have: strip metadata from JPEGs on upload (re-encode with `sharp`). | 1 to 2 h |

### 2.3 Contradictions between documents

| ID | Finding | Where | Proposed change | Effort |
|---|---|---|---|---|
| C1 | **Estimate fallback.** The scope says that with fewer than 3 history tasks, the app shows "the AI's rough estimate from the breakdown, labelled AI guess". The flows say "otherwise nothing is shown". The data model also has `ai_suggestions.kind = estimate` and the folders have `ai/estimate.ts`, which suggests a separate AI estimate call that no flow describes. | scope §5.9; flows §7.4; data model §8; folders §3 | Decide. I suggest: the hint is history only, and AI minutes exist only on breakdown subtasks. Remove the `estimate` kind and `estimate.ts`. | 0.5 h |
| C2 | **Files: many-to-many in the model, one-to-one in the rules.** The ER and model say "a file can be attached to many assignments and many submissions" through two link tables, but the flows refuse a file that is "already attached". | data model §7 and ER; flows §3 step 4, §4.1 | Since a file has exactly one parent, put nullable `assignment_id` and `submission_id` on `files` with a CHECK that exactly one is set once attached, matching `purpose`. Drop `assignment_files` and `submission_files`. Two fewer tables, and the download check becomes one join. | saves 3 to 5 h |
| C3 | **Assignment close fields.** `closed_at` is "set when faculty close it or when it auto-closes", but there is no scheduler, and the submit check already compares `now` with `closes_at`. | data model §3; flows §4.1 step 3 | Keep only `closes_at`. "Close now" sets it to the current time. | saves 1 h |
| C4 | **The scope still says Admin cannot open submission files and has no personal tasks.** decisions.md §3 lists some superseded parts but not scope §6 and §7. | scope §3, §6, §7; decisions §3 | Add both to decisions §3 (part of B6). | 0.2 h |
| C5 | **Team deadline changes count against the assignee.** `reschedule_count` "measures the student's own postponing", but any team member may move a team task's deadline, which raises the *assignee's* count. | data model §4 rules 3 and 4; flows §2 | Only the assignee can move a team task's deadline, or only moves by the assignee raise the count. | 0.5 h |
| C6 | **Typo that inverts a rule.** "The word 'timeframe' is avoided because students may confuse it with a lecture timeframe." A find-and-replace turned "period" into "timeframe". | flows §7.2 | Fix the wording. | 0 h |
| C7 | **Scripts list.** `files:cleanup` is in `CLAUDE.md` and the flows, but not in the folder structure's scripts list or `scripts/` folder. Version headers are stale ("What changed since v0.1" in a v0.3 file). | folders §3, §4; permissions header | Fix during B6. | 0.2 h |
| C8 | **The schedule spreadsheet does not match the scope.** It has 11 phases, while the scope has 12 slices. "Selected-student assignments" is still listed as a stretch goal. The Actions sheet shows done items as "No". Its estimate (220 to 330 h) differs from the scope (310 to 470 h). | `campusflow_plan.xlsx` | Re-baseline from the slice plan in section 4 below. Already in decisions §4 item 4. | 1 h |

### 2.4 Gaps (cases no document decides)

| ID | Gap | Where | Proposed decision | Effort |
|---|---|---|---|---|
| G1 | **Cancelled assignments and removed recipients pollute metrics.** The deleted-task rule (a task deleted after its deadline still counts) was written for a student deleting their own task. But cancelling an assignment and removing a recipient also soft-delete tasks. A student whose overdue assignment was cancelled by the teacher would be charged with a missed task forever. | flows §7.1; data model §4 rule 2 | Add `tasks.deleted_reason` (user_deleted, recipient_removed, assignment_cancelled). The "still counts" rule applies only to user_deleted; the other two are always excluded. | 1 to 2 h |
| G2 | **Leaving or being removed from a class pollutes metrics.** Tasks from a class the student left "stay for history and metrics". So open tasks from that class, due after they left, become "missed" when their deadlines pass. | data model §2 `class_members`; scope §4.2 | Rule: assignment tasks from a class you are no longer active in count only if their deadline was before you left. | 1 h |
| G3 | **The current week's completion rate is wrong until Sunday.** The due set is "tasks with a deadline inside the timeframe", but completion is measured "by `as_of`". On a Monday, a task due on Friday is already in the denominator and lowers the rate. | flows §7.3 | For the current timeframe, due set = deadline between the start and `as_of`. Show still-upcoming tasks separately ("4 more due this week"). | 0.5 h |
| G4 | **The consistency metric is undefined at the edges.** Is the denominator all weeks or only weeks with due tasks? Which Monday-to-Sunday weeks belong to a calendar month that starts on a Thursday? For a week timeframe the value can only be 0 or 1. | scope §5.12; flows §7.3 | Monthly only. A week belongs to the month that contains its Thursday (the rule ISO 8601 uses to place weeks in years). Denominator = weeks with at least one due task; "not enough data" when fewer than 2 such weeks. | 0.5 h |
| G5 | **The 10-task trend minimum.** Is it 10 tasks completed in the timeframe or in the due set, and does the *previous* timeframe also need 10? Ten top-level tasks a week is a lot for a real student, so in the friends test the trends and the AI summary will probably never appear (the summary is also gated on 10). | scope §9; flows §7.3, §8.2 | Both timeframes need the minimum. Week minimum 5, month minimum 10, and these live in `src/config/`. The summary is gated on "at least 3 tasks due". Justify the numbers in the report as small-sample caution, not statistics. | 0.5 h |
| G6 | **Active time depends on people pressing Start.** Going straight from To Do to Done leaves `started_at` empty, and assignment tasks are completed by submitting, often without a Start. In real use, "average active time", "estimate accuracy" and the history-based estimate (all built on active time) will have very little data. | scope §5.3; flows §2 | Make "Start" the obvious first action on every task card, and when someone completes a task with no start, ask once: "When did you start? (skip)". Seed data hides the problem in the demo, but the friends test will expose it, and an examiner may ask. | 2 to 3 h |
| G7 | **No forgotten-password flow, and no email at all.** Email-and-password users who forget their password are stuck, and verification (S1) needs email too. | scope §3 | For the MVP: Admin can generate a one-time reset link from the Users page (audited), shown on screen for Admin to pass on. Later: an email provider. **[Unsure]** of current free-tier limits of email services; check before choosing one. | 3 h |
| G8 | **Which task contexts count in the Growth Tracker** is never stated. | flows §7.1 | Personal, assignment and team tasks assigned to the user, top-level only. Unassigned team tasks count for nobody. | 0 h |
| G9 | **Submitting an assignment task with open subtasks.** "A parent cannot become done while any subtask is not done" conflicts with "submitting completes the task". | data model §4; flows §4.1 | Submitting always completes the parent. Open subtasks are completed at the same moment (consistent with "complete all"). | 0.5 h |
| G10 | **Who may change a team task's status?** The flows say "Assignee (team: active member)". Can a teammate complete *my* task, which changes *my* metrics? | flows §2 | Only the assignee changes status. Any active member can edit, reassign or delete. | 0 h |
| G11 | **How co-teachers are found and added** (by exact email or username, like teams?) is not described. Must the person already have the Faculty role? | scope §7; permissions §4 | Exact username or email of an active Faculty user, owner only, audited. | 0 h |
| G12 | **Editing an assignment after grading.** What if faculty lower `max_marks` below existing grades, or remove an attachment students have already downloaded? | data model §3; permissions §3 `assignment.manage` | Lock `max_marks` once any grade exists. Attachments can be added and removed until the first submission, then only added. | 0.5 h |
| G13 | **How will friends use the app for 1 to 2 weeks?** The AI runs on your laptop and public deployment is out of scope, but friends need a URL. If the app is hosted (for example on Vercel), local-disk file storage does not work there and the AI cannot reach the laptop. Google sign-in in "testing" mode only accepts test users you add by hand **[Unsure]** of the current limit. The demo also needs the internet anyway, because Neon is a cloud database (the scope says "local disk does not [need internet]", but the database does). | scope §2, §4.4, §10; memory of your testing plan | Decide before Slice 11. My suggestion: run on the laptop with a free tunnel (for example Cloudflare Tunnel) during the test fortnight, and keep a **local Postgres copy** as a demo fallback if the venue Wi-Fi fails (`pg_dump` from Neon the night before). This also makes local disk storage final, so Cloudinary can be dropped (P5). | 2 to 4 h |
| G14 | **The test database** is deferred to Slice 0 with no candidates. | folders §7 item 3 | Candidates: PGlite (Postgres compiled to WebAssembly, runs inside Vitest with no install; Drizzle has a driver) for unit and integration tests, plus a Neon branch or local Postgres for Playwright. **[Unsure]** whether PGlite supports every timezone function the metric SQL will use; check in Slice 0. | 0 h now |
| G15 | **Report and viva time are not in any estimate.** Evaluation is demo, report, viva and novelty, but the 310 to 470 hours are build hours only. | scope §12; plan spreadsheet | Add 40 to 60 h for the report, evaluation write-up and viva preparation. Write the report chapter for each slice when the slice ends, while it is fresh. | 0 h now |
| G16 | **Rejected accounts cannot try again** (the email is unique and the status is final). | data model §1 | Admin can reset a rejected account to pending. One action, audited. | 0.5 h |
| G17 | **AI summary storage.** `kind = weekly_summary` "also used for monthly" with only `timeframe_start` cannot tell a weekly summary from a monthly one that starts on the same date. Nothing stops two stored summaries for the same timeframe. | data model §8 | Add `timeframe` (week, month) and a unique index on (user, kind, timeframe, timeframe_start) for closed timeframes. | 0.5 h |
| G18 | **The CHECK on status and `completed_at`** only covers done and todo. `in_progress` with a `completed_at` would pass. | data model §4 | Use `CHECK ((status = 'done') = (completed_at IS NOT NULL))`. | 0 h |
| G19 | **Seed rows versus command rules.** The seed must back-date `created_at`, `started_at` and `completed_at`, but the rules say only `tasks/commands.ts` writes tasks, using `now()`. `is_seed` is not on `task_events`, `submissions`, `grades`, `class_members` or `ai_suggestions`, which the demo seed will also create. | data model conventions; folders §4 | Make the seed an explicit exception. Simpler marking: only seed *users* carry `is_seed`, and everything they own is simulated by definition (the banner shows on a seed user's data). Keep `is_seed` on `users` only. | saves 1 to 2 h |

### 2.5 Colour palette (`color-palette.md`)

I checked contrast against WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and for UI parts such as borders, focus rings and indicators.

| Pair | Ratio | Result |
|---|---|---|
| White text on teal `#0D4F4C` (sidebar, primary buttons) | 9.38 | Pass |
| `#2B2B2B` text on `#FAF7F2` background | 13.25 | Pass |
| White text on coral `#E8735A` | **2.99** | **Fails, even for large text** |
| `#2B2B2B` text on coral | 4.74 | Pass |
| Coral as text or links on the background | **2.79** | **Fails** |
| White text on amber `#F2B84B` | **1.79** | **Fails badly** |
| `#2B2B2B` text on amber | 7.91 | Pass |
| Amber indicator on the `#FAF7F2` background | **1.67** | **Fails the 3:1 rule for indicators** |
| Amber indicator on the teal sidebar | 5.24 | Pass |
| White cards on `#FAF7F2` | 1.07 | Cards are invisible without a border or shadow |

| ID | Finding | Proposed change | Effort |
|---|---|---|---|
| D1 | Coral buttons with white text fail. | Coral buttons use dark text `#2B2B2B`. For coral text, links, or a white-text coral button, add a darker shade such as `#B4452F` (5.13 on the background, 5.48 with white text). | 0 h |
| D2 | Amber "selected" and "reminder" indicators fail on the main background. | Use amber freely on the teal sidebar. On the light background, pair it with a darker edge or icon (for example `#8A5A00`, 5.55:1) and never rely on colour alone. Never put white text on amber. | 0 h |
| D3 | **Missing colours:** error or destructive, success, warning, info, border, muted text, focus ring, and the task states (To Do, In progress, Done, overdue, late). Coral already looks like a warning, so a separate red is needed to keep "secondary action" and "danger" apart. | Add a semantic row, for example danger `#B91C1C` (6.05 on the background), success `#15803D` (4.69), a warm border such as `#E5DED2` (not yet contrast-checked), focus ring = teal. Map everything to shadcn's CSS variables (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--accent`, `--destructive`, `--muted`, `--border`, `--ring`) so Sonnet uses tokens, never raw hex values. | 1 h |
| D4 | **Visual hierarchy.** Coral is louder than teal, so "secondary" buttons would draw more attention than primary ones. | Your call, since this is a design choice. One option: secondary buttons are teal outline; coral is the 10% accent for one signature action (for example "Break this down" with AI) and highlights. | 0 h |
| D5 | **Chart colours** for the Growth Tracker and class tracker are not defined. | Teal, coral and amber as the first three series, each checked against the background, with labels so colour is never the only cue. | 0.5 h |
| D6 | **Sonnet will not find the palette.** It is not in `decisions.md` or `CLAUDE.md`, and the file mixes headings and notes. Dark mode is not mentioned. | Add "UI: tokens in `color-palette.md`, light mode only for the MVP" to `decisions.md`, and add a line to `CLAUDE.md`. | 0.2 h |

---

## 3. Simplifications, ranked by hours saved

Your confirmed decisions are listed where a proposal reverses one. Approve only what you are comfortable defending.

| ID | Cut, merge or defer | What it saves | Hours saved | Reverses a confirmed decision? |
|---|---|---|---|---|
| P1 | **Defer teams to after the first demo,** or simplify them: the creator adds members by exact username, with no invite and accept, no "former member", and no creator transfer. Teams are the module least tied to your novelty (AI plus Growth Tracker) and they are not on the scope's cut list at all. | Slice 7, its tests, Admin team pages | 35 to 50 (defer) or 10 to 15 (simplify) | Partly (invite and accept) |
| P2 | **Narrow the Admin override:** Admin can view classes read-only, transfer class ownership and transfer team creator. Admin cannot edit grades or assignments; a faculty member does that. This also makes the "why can Admin change a grade?" viva question go away (least privilege, separation of duties). | Override branches in every academic policy, the "Acting as admin" write paths, about half the override tests | 6 to 10 | Yes (Admin override tiers) |
| P3 | **Keep the permission grid but restrict it** with `eligibleRoles` (S3), and **merge keys from 32 to about 20.** For example: one `dashboard.view` (the content follows the role); `class.code.manage` into `class.members.manage`; `tracker.class.view` into `class.view` for faculty; `admin.users.view`, `approve` and `deactivate` into `admin.users.manage`; `ai.breakdown.use` and `ai.summary.use` into `ai.use`. | Grid rows, test-matrix size, seed and description text | 8 to 15 | No (the grid stays) |
| P4 | **Simplify joining and leaving:** approval is always on (drop the `requires_approval` toggle), and leave requests are replaced by "the student leaves; faculty can re-approve if they come back". Leave approval is already #2 on your own cut list. | One setting, one status, one tab, the leave flow | 6 to 10 | Partly (leave approval) |
| P5 | **Drop Cloudinary for the MVP.** The demo runs on the laptop anyway (the AI is local), so local disk is enough. Keep the storage interface so it can be added later. **[Unsure]** Free Cloudinary accounts may block PDF delivery by default, which would need a settings change; another reason to skip it for now. | The evaluation, the second implementation, signed-link handling, the internet dependency | 4 to 8 | No (it was "evaluate") |
| P6 | **Files: one parent per file** (C2) and a single `closes_at` (C3). | Two link tables and one column | 4 to 6 | No |
| P7 | **Weekly summary, template-first:** code writes every factual sentence ("You completed 7 of 9 tasks due this week (78%)"). The model only writes up to three short suggestions, and **any digit in its output is rejected.** The number-matching check (which has to handle 0.78 versus "78%", rounding, and spelled-out numbers such as "three") disappears, and the summary can never state a wrong number. | The number checker and its edge cases | 3 to 6 | No (it strengthens the rule) |
| P8 | **Trim the metrics to four for the first version:** completion rate, on-time rate, average active time, estimate accuracy. Defer rescheduling, average overall time and consistency (consistency is monthly only anyway, see G4). Each metric costs SQL, a hand-calculated fixture, a UI tile and a viva explanation. | Three metrics | 4 to 8 | Partly (consistency) |
| P9 | **Email and password only until after the first demo** (Google login is already #1 on your cut list). This also postpones S1's account-linking problem. | OAuth console setup, linking rules, the Google-specific welcome path | 5 to 8 | No (it is already on the cut list) |
| P10 | **Co-teachers after the first demo** (#3 on your cut list). Every class check then becomes "is the class owner", which halves the per-class capacity tests. | Capacity helper, co-teacher management, tests | 5 to 8 | No (it is on the cut list) |

**Total if all are approved:** about 80 to 130 hours, which turns 310 to 470 into roughly 230 to 340. My recommendation is P3, P5, P6, P7 and P9 for certain (no loss of anything you care about), with P1, P2, P4, P8 and P10 as your choice.

---

## 4. Plan check: slice order and hours

### Problems with the current order
- **The novelty arrives last.** AI is slice 10 and the Growth Tracker slice 9. If the schedule slips (it usually does), the first demo shows a task manager plus a classroom clone, which is the weakest possible answer to the novelty question. Your own spreadsheet calls the AI "the riskiest piece", and risky pieces should be tried early.
- **The full Admin permission editor (slice 2) comes before any feature uses permissions,** so it is built against imaginary needs.
- **Teams (slice 7) come before metrics (slice 8),** but nothing in the metrics depends on teams.

### Proposed order
Hours are my estimates, with Claude writing code and you reviewing and testing.

| # | Slice | Exit check | Hours |
|---|---|---|---|
| 0 | Setup: Next.js, `pg` driver, Neon plus local Postgres, env, lint rules, Vitest, a CI workflow running typecheck, lint and tests on GitHub (free) | App runs, migration applies, CI passes | 10 to 15 |
| 1 | Auth: email and password, welcome (username, requested role), pending, approval page, CLI first admin (B5), `input: false` test (B1) | Pending user blocked; self-approval test passes | 18 to 28 |
| 2 | `authorize()` pipeline with seeded grants (grid read-only for now), audit writes, permission test harness | Table-driven tests run | 12 to 18 |
| 3 | Personal tasks, subtasks, statuses, timestamps, events | All the flows §2 rules tested | 25 to 35 |
| 4 | **AI breakdown** on personal tasks, queue, `eval:ai` with the first 10 cases | Invalid output never saved; eval table produced | 25 to 40 |
| 5 | **Metrics plus Growth Tracker** (day and week), `seed:demo` | Hand-calculated fixtures pass | 30 to 45 |
| | **Checkpoint A** (about mid-December): a student can plan, break down with AI and see growth. This is a complete, novel demo on its own. | | **≈120 to 180** |
| 6 | Classes, codes, join requests (owner only) | Expired code refused; declined student stays out | 18 to 25 |
| 7 | Assignments, submissions, files, grading | Unauthorised file access refused; versions correct | 40 to 60 |
| 8 | Class tracker, faculty dashboard | Numbers match fixtures | 12 to 18 |
| | **Checkpoint B (first university demo):** the full academic loop plus the novelty | | **≈190 to 285** |
| 9 | Template weekly summary (P7), month view, history-based estimate hint | Summary never contains a model-written number | 15 to 25 |
| 10 | Grid editing with `eligibleRoles`, transfers, audit viewer | Permission change works on the next request | 12 to 20 |
| 11 | Teams (simplified, P1) | Only active members see team tasks | 15 to 30 |
| 12 | Google login with safe linking, co-teachers, leave flow (whichever you still want) | | 15 to 25 |
| 13 | Hardening, friends test, demo setup, Opus security review | Full demo run from the laptop, offline fallback rehearsed | 25 to 40 |
| | **Total build** | | **≈ 270 to 425** |
| | **Plus report and viva** (G15) | | **40 to 60** |

**Is 310 to 470 hours realistic?** For the design as written, it is plausible but the low end is optimistic, because your review-and-understand loop (which the viva requires) is the real bottleneck, not code generation. I would plan on the upper half. From now to 1 February 2027 is about 14 weeks × 21 h × 0.85 ≈ **250 realised hours**. That reaches Checkpoint B only with the simplifications above, or by starting Checkpoint B a little late. Everything after slice 8 fits before the final deadline. **[Unsure]** These are estimates; re-check at the end of slice 3 with your real pace, as the spreadsheet's week-4 checkpoint already suggests.

**Must-demo core if time runs short:** sign-up with approval, personal tasks with subtasks, AI breakdown with the edit-before-save step, Growth Tracker week view with clearly labelled seed data, one class with one assignment submitted and graded, and a live demonstration that a student cannot open another student's file. Everything else is optional.

---

## 5. The [Verify] items

| Item | Result | Source |
|---|---|---|
| Better Auth username | **[Checked]** The username plugin adds `username` (normalised to lower case by default, so case-insensitive) and `displayUsername`. Defaults: 3 to 30 characters, letters, numbers, underscore and dot. Set `maxUsernameLength: 20` to match the model. `immutableUsername: true` stops changes after first set; decide whether usernames may change (not decided anywhere). Social sign-ups do not get a username automatically, hence B2. | Better Auth username plugin docs |
| Better Auth extra fields | **[Checked]** `user.additionalFields` with `type`, `required`, `defaultValue`, `input`, `returned`. `input: false` = server-owned (B1). `defaultValue` applies only in JavaScript, so add real database defaults (`status` default 'pending') in the Drizzle schema. UUID IDs: `advanced.database.generateId: "uuid"`. | Better Auth database docs |
| Session revocation on deactivation | **[Checked]** See S10. | Better Auth session and admin plugin docs |
| Next.js `proxy.ts` | **[Checked]** In Next.js 16 `middleware.ts` became `proxy.ts`, the export is named `proxy`, and it runs on Node.js (not configurable). Body buffering limit: S5. A codemod exists (`middleware-to-proxy`). | Next.js docs, article |
| Server action body limit | **[Checked]** 1 MB by default (`serverActions.bodySizeLimit`), so using a route handler for uploads is the right call. Server actions only accept same-origin requests by default. | Next.js docs |
| Drizzle migrations | `generate` then `migrate`, with committed SQL, is the standard workflow. Drizzle supports `check()` constraints and partial indexes (`.where()`), which B3 and G18 need. From my knowledge, not re-checked today. **[Unsure]** of the exact current syntax. | Drizzle docs (B4 checked) |
| Ollama structured outputs | **[Checked]** Pass the JSON schema in `format` (from Zod with `z.toJSONSchema`). The docs recommend also putting the schema in the prompt, using temperature 0, and validating afterwards. Not supported on Ollama's cloud (irrelevant here). Also set `keep_alive` (for example 30 minutes) and send a warm-up request when the app starts, so the first demo click is not a cold model load. | Ollama docs |
| Upload handling in route handlers | See S5 and S6. | Next.js docs |
| Neon free tier | **[Checked]** 100 compute-hours per project per month, 1 GB storage per project, and the database sleeps after 5 minutes idle. That is fine for you; open the app a minute before a demo so the first page is not slow. | Neon docs |

### Is schema-forced JSON realistic for a 3B model?
**For the breakdown, yes.** Ollama constrains generation to the schema, so the *shape* is almost always valid; your own test produced valid JSON in about 4 seconds. The remaining risk is *quality* (vague or duplicate steps, silly minute estimates), which your Zod checks, retry, edit-before-save and evaluation set already handle. **[Unsure]** whether limits such as "3 to 10 items" or string lengths are enforced during generation or only by Zod afterwards. Assume only Zod.
**For the summary, risky as designed,** because small models invent and round numbers. P7 removes that risk.

---

## 6. Viva readiness

These are the questions I would expect an examiner to ask, with the one-paragraph answer each decision supports.

| Likely question | Defensible? | Answer in brief |
|---|---|---|
| "Why one `tasks` table for three kinds of task?" | Yes | One status and timestamp engine and one metric query across all contexts; CHECK constraints enforce each context's required columns; the alternative (three tables) duplicates the rules three times. Mention B3 as a bug the design review caught. |
| "Why calculate lateness instead of storing it?" | Yes, strong | Single source of truth: when a deadline changes, every view agrees at once; a stored flag can go stale. The cost is a trivial comparison per row. |
| "Why a local 3B model and not an API?" | Yes | Privacy (student data never leaves the machine), zero cost, works offline, and the university context. Show the evaluation table (valid-output rate, acceptance and edit rate from `ai_suggestions`) to prove it is good enough. |
| "How do you know the AI actually helps?" | Weak today | Plan it now: the 20 to 30 case rubric, the logged acceptance, edit and discard rates, and a short questionnaire for the friends test (for example the System Usability Scale plus two questions on the breakdown). Be honest about the small sample. |
| "Your on-time rate ignores overdue unfinished tasks. Can't students game it?" | Yes, if prepared | Yes, deliberately: completion rate catches unfinished work, and on-time measures the quality of finished work. Two complementary metrics. |
| "Why 10 tasks for a trend? Why 70% for consistency?" | Only if justified | Present them as configurable product thresholds chosen to avoid noisy conclusions from tiny samples, not statistical results (G5). |
| "Why can Admin change a student's grade?" | Weak | Least privilege says Admin should not. P2 removes the question. |
| "Admin can't see personal data, but you own the database. Isn't that privacy theatre?" | Yes, if honest | It is application-level privacy, enforced and tested in code; the database operator can still read rows. Real systems separate the operator from the admin role; encryption at rest per user is future work. |
| "What stops a student opening someone else's submission?" | Yes, strong | The five-step pipeline, scoped queries ("not found", never "forbidden"), file downloads only through a checking route, and the table-driven permission tests. Demonstrate it live. |
| "What is novel here? Isn't this Classroom plus Todoist?" | Needs a prepared paragraph | One place for academic and personal work; AI breakdown grounded in the student's own history (code-computed estimates, the model never does arithmetic); a Growth Tracker whose AI text can never state a number it was not given. Say "integration plus trustworthy AI", not "first ever". |
| "Why let an admin edit a permission grid at all?" | Yes with S3 | Data-driven role-based access control plus fixed relationship rules in code (a hybrid of roles and relationships); `eligibleRoles` prevents nonsensical grants. |
| "Your seed data: isn't the demo fake?" | Yes | Every simulated row is labelled in the UI and in the report; the friends test gives real data; the metrics are tested on hand-calculated fixtures. |

---

## 7. Additions for `CLAUDE.md` (Sonnet-specific)

Sonnet will follow `CLAUDE.md` closely, so its gaps matter most. Proposed new lines (not yet applied):

1. Better Auth: every app-owned field on `user` has `input: false`; never enable `session.cookieCache`; `is-username-available` is disabled.
2. Database driver is `pg`. Transactions use `db.transaction`. Never use `neon-http`.
3. Never pass a raw database row to a Client Component; select only the needed columns.
4. Auth is checked in every page's data function and every action, never only in a layout or in `proxy.ts`.
5. `proxy.ts` matcher excludes `/api/files` and the upload route.
6. AI output and user text are rendered as plain text only.
7. No secrets in `NEXT_PUBLIC_*` variables.
8. UI uses the theme tokens from `color-palette.md` through shadcn CSS variables; no raw hex values in components.
9. Commands are for Windows PowerShell.
10. Read only the current documents (named in `decisions.md`); ignore `docs/archive/`.
11. Do not recall library APIs from memory for Better Auth, Next.js 16, Drizzle or Ollama; check the current docs (these libraries change quickly).
12. At the end of slices 1, 2 and 7, stop for a security review by a separate session before merging.

---

## 8. Decisions for you

Reply with the IDs you approve, reject or want changed. Once you have answered, I will draft the document updates, again for your review first.

**Blockers (please decide first):** B1 (and `input: false` versus a separate profile table), B2, B3, B4, B5, B6.
**Security:** S1 option (a) or (b); S2; S3; S4 (refuse versus end memberships); S5 to S16.
**Gaps needing your answer:** G1, G2, G3, G4, G5 (thresholds), G6, G7, G9, G10, G11, G12, G13 (how friends reach the app), G16, G17, G19; also whether usernames can change (section 5).
**Simplifications:** P1 to P10 (my firm recommendation: P3, P5, P6, P7, P9).
**Palette:** D1 to D6 (D4 is purely your taste).
**Plan:** the new slice order and the two checkpoints in section 4.
**Missing input:** the wireframe link.

---

## Sources

- [Better Auth: Username plugin](https://better-auth.com/docs/plugins/username.md)
- [Better Auth: Database and additional fields](https://better-auth.com/docs/concepts/database)
- [Better Auth: Users and accounts (account linking)](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth: Session management](https://better-auth.com/docs/concepts/session-management)
- [Better Auth: Admin plugin](https://better-auth.com/docs/plugins/admin)
- [Better Auth: Rate limit](https://better-auth.com/docs/concepts/rate-limit)
- [Next.js: proxyClientMaxBodySize](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize)
- [Next.js: serverActions config](https://nextjs.org/docs/app/api-reference/next-config-js/serverActions)
- [Next.js Proxy replaces Middleware (John Kavanagh)](https://johnkavanagh.co.uk/articles/next-js-proxy-replaces-middleware/)
- [Drizzle: Connect Neon](https://orm.drizzle.team/docs/connect-neon)
- [Ollama: Structured outputs](https://docs.ollama.com/capabilities/structured-outputs.md)
- [Neon: Free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas)
- [Vercel: CVE-2025-55182 summary](https://vercel.com/changelog/cve-2025-55182)
