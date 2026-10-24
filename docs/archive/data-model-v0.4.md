# CampusFlow AI: data model draft (v0.4)

Phase 2, step 1. A design draft in plain language, **not** Drizzle code. Not final until the owner approves it.

## What changed since v0.3

Everything below is confirmed by the owner.

- **Joining a class needs the teacher's approval.** `class_members.status` gains `requested` and `rejected`; new column `requested_at`; `joined_at` is now optional (set on approval). New `classes.requires_approval` (default true). Rule 8.
- **Usernames.** `users.username` (unique, not case sensitive), chosen by everyone at first sign-in, also for Google sign-ups. Used for exact-match lookup when inviting to a team. Rule 7 updated.
- **Requested role.** `users.requested_role` (student, faculty, or empty): what the person says they are when they choose their username. It is only a hint for the Admin; it never grants anything. Admin is not offered at sign-up.
- **Lateness is never stored.** `submissions.is_late` removed; late or on time is calculated from `submitted_at` and the deadline now in force.
- **Cancelling an assignment:** `assignments.deleted_at`.
- **File purpose:** `files.purpose` (assignment_attachment, submission) and `files.attached_at`, so unattached uploads can be cleaned up.
- **AI summaries know their timeframe:** `ai_suggestions.timeframe_start` (date, optional) for weekly and monthly summaries.
- **AI breakdown subtasks link back:** `tasks.ai_suggestion_id` (optional) records which suggestion created a subtask.
- **Deleted-task counting rule** (rule 2) rewritten to match the owner's decision.
- "Period" is now called **timeframe** (day, week, month) everywhere; this only affects metrics, not tables.

(Earlier: v0.3 team invite and accept, ER diagram; v0.2 co-teachers, soft delete and deadline rules, `task_events`, `category_other`, `resubmission_until`, one grade per task, `assignment_files` link table.)

## Entity relationship diagram

![CampusFlow AI ER diagram](er-diagram.png)

Save `er-diagram.png` and `er-diagram.svg` next to this file in `docs/`. The SVG stays sharp when zoomed.

### Relationships in words (same content as the diagram)

- A **role** has many users and many role_permissions. A **permission** appears in many role_permissions.
- A **class** has many class_faculty rows (one owner, optional co-teachers), many class_members, many enrollment_codes and many assignments. An enrollment code can be the source of many class_members (join requests).
- An **assignment** has many assignment_files and becomes **one task per recipient** (`tasks.assignment_id`). A **file** can be attached to many assignments and many submissions through the link tables.
- A **task** may have many subtasks (`tasks.parent_task_id`), many task_events, many submissions, at most one grade and many ai_suggestions.
- A **team** has many team_members and many tasks (`tasks.team_id`).
- A **submission** has many submission_files. A **grade** points to the submission version that was graded.
- **users** is referenced by `created_by`, `uploaded_by`, `assignee_id`, `actor_id`, `submitted_by`, `graded_by`, `invited_by` and `user_id` columns in most tables (listed in the note on the diagram).

## Conventions

- Primary keys: `id` as UUID unless a table uses a composite key (noted).
- Timestamps: `timestamptz`, stored in UTC. Most tables have `created_at`; mutable ones also `updated_at`.
- Enums: Postgres enums (Drizzle `pgEnum`).
- "Req" = required (NOT NULL). "Opt" = optional (nullable).
- `is_seed` (boolean, default false) marks simulated demo rows, only on tables where demo data is generated.
- Computed values (overdue, active time, overall time, on-time, rates) are **not stored**; they are calculated in queries.
- Better Auth owns its own tables (`session`, `account`, `verification`, plus the base `user` table). The `account` table holds the password hash and the Google link. We never touch those directly. How `user` is extended is to be verified in the current Better Auth docs.

Total: 20 tables of our own (including the extended `users`), plus Better Auth's.

---

## 1. Identity and access

### users (Better Auth `user` table, extended)

| Column | Type | Notes |
|---|---|---|
| id | uuid/text | Better Auth may use text IDs; follow the library |
| name | text, req | From signup or Google |
| email | text, req, unique | |
| username | text, req, unique | Chosen at first sign-in, 3 to 20 characters (letters, numbers, dot, underscore), compared without case. Set for Google sign-ups too. Whether Better Auth's username plugin fits is to be verified; otherwise a plain column with our own check |
| email_verified | boolean | Provided by Better Auth (Google sets true) |
| image | text, opt | Google avatar |
| status | enum, req | pending, active, rejected, deactivated. Default pending |
| requested_role | enum, opt | student or faculty, chosen at first sign-in; empty if the person skips it (for example someone who will be an Admin). A hint only: permissions come from `role_id` |
| role_id | FK roles, opt | Null until approved. Approval requires the Admin to pick a role here |
| timezone | text, req | Default `Asia/Kolkata` |
| approved_by | FK users, opt | |
| approved_at | timestamptz, opt | |
| rejection_reason | text, opt | |
| is_seed | boolean | |
| created_at, updated_at | timestamptz | |

### roles

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| key | text, req, unique | admin, faculty, student |
| name | text, req | Display name |
| description | text, opt | |
| is_system | boolean | True for the three built-in roles (cannot be deleted) |
| created_at | timestamptz | |

### permissions

Seeded from code; admins cannot create new permission keys, only assign existing ones.

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| key | text, req, unique | e.g. `class.create`, `assignment.post`, `submission.grade` |
| module | text, req | Grouping for the Admin page |
| description | text, req | Shown on the Admin page |

### role_permissions

| Column | Type | Notes |
|---|---|---|
| role_id | FK roles | Composite PK with permission_id |
| permission_id | FK permissions | |
| created_at | timestamptz | |

### audit_logs (append-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| actor_id | FK users, req | Who did it |
| action | text, req | e.g. `user.approved`, `role.changed`, `permission.granted` |
| target_type | text, req | user, role, class, etc. |
| target_id | text, opt | |
| details | jsonb, opt | Before and after values |
| created_at | timestamptz | |

---

## 2. Classes

### classes

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text, req | |
| course_code | text, opt | |
| description | text, opt | |
| term | text, opt | e.g. "2026-27 Sem 7" |
| created_by | FK users, req | |
| requires_approval | boolean, req | Default true. When false, a valid code joins the student immediately. Removed or declined students are always reviewed |
| archived_at | timestamptz, opt | Soft archive, never hard delete |
| is_seed | boolean | |
| created_at, updated_at | timestamptz | |

### class_faculty

| Column | Type | Notes |
|---|---|---|
| class_id | FK classes | Composite PK with user_id |
| user_id | FK users | Must have the faculty role (checked in code) |
| role | enum, req | owner, co_teacher |
| added_by | FK users | |
| created_at | timestamptz | |

Constraint: exactly one `owner` per class (partial unique index).

### class_members

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| class_id | FK classes, req | |
| student_id | FK users, req | |
| status | enum, req | requested, active, leave_requested, left, removed, rejected |
| joined_via_code_id | FK enrollment_codes, opt | |
| requested_at | timestamptz, opt | When the student entered the code |
| joined_at | timestamptz, opt | Set when the request is approved (or at once when approval is off) |
| leave_requested_at | timestamptz, opt | |
| leave_reason | text, opt | |
| status_changed_at | timestamptz | |
| status_changed_by | FK users, opt | Faculty who approved, declined or removed |

Constraint: unique (class_id, student_id). Entering the code again after `left` or `removed` sets the same row back to `requested`; a `rejected` student cannot request again until the teacher reconsiders (rule 8); the history goes in `audit_logs`. Students whose status is `requested` or `rejected` see no class content. Tasks from a class the student left or was removed from stay for history and are hidden from active lists (derived from this status, not stored on the task).

### enrollment_codes

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| class_id | FK classes, req | |
| code | text, req, unique | 8 characters, no look-alike characters |
| created_by | FK users, req | |
| expires_at | timestamptz, req | Join check compares with the current time |
| is_active | boolean, req | Faculty can deactivate manually |
| deactivated_at | timestamptz, opt | |
| created_at | timestamptz | |

---

## 3. Assignments

### assignments

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| class_id | FK classes, req | |
| created_by | FK users, req | Faculty |
| title | text, req | |
| description | text, opt | |
| audience | enum, req | all, selected (informational; the real recipients are the task rows) |
| max_marks | numeric, req | |
| due_at | timestamptz, req | Copied to each recipient task's `deadline` |
| closes_at | timestamptz, opt | Automatic close time |
| closed_at | timestamptz, opt | Set when faculty close it or when it auto-closes |
| deleted_at | timestamptz, opt | Cancelled before any submission; its recipient tasks are soft-deleted with it |
| is_seed | boolean | |
| created_at, updated_at | timestamptz | |

### assignment_files

| Column | Type | Notes |
|---|---|---|
| assignment_id | FK assignments | Composite PK with file_id |
| file_id | FK files | |

---

## 4. Tasks (the core)

### tasks

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| context | enum, req | personal, assignment, team |
| created_by | FK users, req | |
| assignee_id | FK users, opt | Required for personal and assignment. Optional for team (unassigned team task) |
| assignment_id | FK assignments, opt | Required when context = assignment |
| team_id | FK teams, opt | Required when context = team |
| parent_task_id | FK tasks, opt | Subtask link; one level only |
| title | text, req | |
| description | text, opt | |
| category | enum, req | assignment, study, project, reading, other |
| category_other | text, opt | Custom label. Required when category = other, otherwise null (CHECK) |
| priority | enum, req | low, medium, high. Default medium |
| status | enum, req | todo, in_progress, done. Default todo. UI label: "To Do" |
| source | enum, req | manual, ai_breakdown |
| ai_suggestion_id | FK ai_suggestions, opt | The suggestion that created this subtask (when source = ai_breakdown) |
| deadline | timestamptz, opt | Current deadline |
| original_deadline | timestamptz, opt | Set the first time a deadline is set |
| reschedule_count | int, req | Default 0. See rules below |
| estimate_minutes | int, opt | |
| estimate_source | enum, opt | user, history, ai |
| resubmission_until | timestamptz, opt | Assignment tasks only. Faculty set this to allow another submission after the assignment closed or after the task was graded |
| started_at | timestamptz, opt | First time status became in_progress; never overwritten |
| completed_at | timestamptz, opt | |
| deleted_at | timestamptz, opt | Soft delete |
| is_seed | boolean | |
| created_at, updated_at | timestamptz | |

Not stored, calculated: overdue, active time, overall time, on-time, planned-for-week, "needs re-review" (a submission version newer than the graded one).

Enforced by the database (CHECK, unique index) or by code:
- context = personal: assignment_id and team_id null; assignee_id = created_by.
- context = assignment: assignment_id and assignee_id required; team_id null; unique (assignment_id, assignee_id) so a student never gets the same assignment twice.
- context = team: team_id required.
- status = done requires `completed_at`; status = todo requires it null (CHECK).
- category = other requires `category_other`; any other category requires it null (CHECK).
- A subtask's parent must be a top-level task with the same context and assignee (code).
- A parent cannot become done while any subtask is not done (code).

### task_events (append-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| task_id | FK tasks, req | |
| actor_id | FK users, req | |
| event_type | enum, req | created, status_changed, deadline_changed, reopened, deleted, restored, resubmission_granted |
| from_value | text, opt | |
| to_value | text, opt | |
| created_at | timestamptz | When it happened |

### Rules agreed (these affect queries)

1. **Subtasks are not counted** in completion rate, on-time rate or other metrics. Only top-level tasks count.
2. **Deletion:** soft delete. Students cannot delete assignment tasks (faculty remove recipients). A deleted task still counts in metrics if it was already completed, or already past its deadline, when it was deleted; a task deleted while still open and before its deadline is excluded. Deleting a task therefore cannot be used to change history.
3. **Deadline edits on personal and team tasks:** on-time uses the current deadline. `reschedule_count` increases each time the assignee moves the deadline later. `original_deadline` keeps the first deadline.
4. **Faculty changing an assignment's due date** updates every recipient task's `deadline` and logs a `deadline_changed` event, but does **not** increase `reschedule_count` (that count measures the student's own postponing).
5. **Reopening:** allowed for personal and team tasks (clears `completed_at`, keeps `started_at`, logs a `reopened` event; a later completion is measured against the deadline again). Not allowed for assignment tasks. For those, faculty use `resubmission_until` instead, so the task stays Done, the first submission time still decides on-time, and no completion time is rewritten.
6. **One grade per task.** Editing replaces the previous grade.
7. **Team membership (invite and accept):** the creator's row is `active` from creation. The creator invites an active user, found by **exact email or exact username** (no browsable directory); the row starts as `invited`. The invitee accepts (`active`, `joined_at` set) or declines (`declined`). Only `active` members see the team and its tasks, and only they can create or be assigned team tasks. Re-inviting someone who declined or was removed resets their row to `invited`. Pending invites appear in the app (no email). The creator can remove members, members can leave, and the creator cannot be removed in the MVP. Tasks assigned to a removed member stay assigned to them for history, are shown as "former member", and any active member can reassign them. **[Confirm]**
8. **Joining a class (request and approve):** a valid code creates a request (`requested`), or an active membership when the class has `requires_approval` off. The teacher approves (`active`) or declines (`rejected`) from the Requests tab. A declined student stays outside and cannot request again by themselves; the teacher can reconsider from the Declined tab, which sets the row back to `requested`. A student who left or was removed also goes through `requested`. Direct add by username is a later feature.

---

## 5. Submissions

### submissions (one row per version)

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| task_id | FK tasks, req | The student's assignment task |
| version | int, req | 1, 2, 3 ... Unique (task_id, version) |
| text_body | text, opt | |
| link_url | text, opt | |
| submitted_by | FK users, req | |
| submitted_at | timestamptz, req | Late or on time is calculated from this and the deadline now in force; never stored |

At least one of text_body, link_url or an attached file is required (code).

### submission_files

| Column | Type | Notes |
|---|---|---|
| submission_id | FK submissions | Composite PK with file_id |
| file_id | FK files | |

### grades

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| task_id | FK tasks, req, unique | One grade per student task |
| submission_id | FK submissions, req | The version that was graded |
| marks | numeric, req | Must not exceed the assignment's max_marks (code) |
| comment | text, opt | |
| graded_by | FK users, req | |
| graded_at | timestamptz | |
| updated_at | timestamptz | Faculty can edit a grade |

---

## 6. Teams

### teams

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text, req | |
| description | text, opt | |
| created_by | FK users, req | Creator manages members |
| archived_at | timestamptz, opt | |
| is_seed | boolean | |
| created_at, updated_at | timestamptz | |

### team_members

| Column | Type | Notes |
|---|---|---|
| team_id | FK teams | Composite PK with user_id |
| user_id | FK users | |
| role | enum, req | creator, member |
| status | enum, req | invited, active, declined, removed. The creator's row is active from the start |
| invited_by | FK users, req | The creator |
| invited_at | timestamptz, req | |
| responded_at | timestamptz, opt | When the invitee accepted or declined |
| joined_at | timestamptz, opt | Set on accept (for the creator: at team creation) |
| removed_at | timestamptz, opt | Soft removal; their old team tasks stay |

---

## 7. Files

### files

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| storage_provider | enum, req | local, cloudinary |
| storage_key | text, req | Random ID or path inside the storage; never the user's file name |
| original_name | text, req | For display and download only |
| mime_type | text, req | Verified from content |
| size_bytes | bigint, req | Stored so the cap can be enforced and audited |
| uploaded_by | FK users, req | |
| purpose | enum, req | assignment_attachment, submission |
| attached_at | timestamptz, opt | Set when the file is linked to an assignment or submission. Files still empty after a day are removed by `npm run files:cleanup` |
| created_at | timestamptz | |
| deleted_at | timestamptz, opt | |

The **file size cap is a setting** (for example `MAX_FILE_SIZE_BYTES`), not a column, so it can be decided after the storage choice without changing the schema. Files are linked through `assignment_files` and `submission_files`; access is decided by joining those links to classes and tasks. The file row itself has no permissions.

---

## 8. AI

### ai_suggestions

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | FK users, req | |
| task_id | FK tasks, opt | For breakdowns |
| kind | enum, req | breakdown, estimate, weekly_summary (also used for monthly) |
| timeframe_start | date, opt | First day of the week or month a summary covers |
| model | text, req | e.g. llama3.2:3b |
| prompt_version | text, req | For comparing prompt versions in the evaluation |
| input_snapshot | jsonb, req | What was sent |
| output_raw | jsonb or text, opt | What came back |
| output_valid | boolean, req | Did it pass validation |
| latency_ms | int, opt | |
| items_suggested | int, opt | Subtasks suggested |
| items_kept | int, opt | Subtasks the student kept |
| outcome | enum, req | pending, accepted, edited, discarded, failed |
| rating | smallint, opt | 1 to 5 from the student |
| feedback_text | text, opt | Optional comment |
| created_at | timestamptz | |
| resolved_at | timestamptz, opt | |

The rating columns are kept for now; how they are used is revisited later. Training or fine-tuning the model on this data is out of scope.

---

## Not stored on purpose

- **Growth Tracker numbers:** computed from `tasks` and `task_events`. Cached summaries only if queries turn out slow.
- **AI evaluation set (20 to 30 sample assignments):** JSON files in the repo, not in the database.
- **Out of scope tables:** notifications, messages, comments, notes, milestones, external calendar sync, workflows. (An in-app day, week and month view is in scope and needs no extra table; it reads `tasks`.)

## Open items

1. File size cap value (decide together with the storage choice).
2. Confirm the "former member" handling in rule 7.
3. Verify in the Better Auth docs how `username` is added to the `user` table (Slice 1).

## Later (not in the MVP)

Team join codes (would add a `team_join_codes` table), external calendar sync, CSV bulk import, workflow locking, per-user custom permissions, team assignments, milestones.
