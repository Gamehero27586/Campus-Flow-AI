# CampusFlow AI: data model draft (v0.1)

Phase 2, step 1. This is a design draft in plain language, **not** Drizzle code. Nothing here is final until the owner approves it.

## Conventions

- Primary keys: `id` as UUID unless a table uses a composite key (noted).
- Timestamps: `timestamptz`, stored in UTC. Most tables also have `created_at`; mutable ones have `updated_at`.
- Enums: Postgres enums (Drizzle `pgEnum`).
- "Req" = required (NOT NULL). "Opt" = optional (nullable).
- `is_seed` (boolean, default false) marks simulated demo rows. It appears only on the tables where demo data is generated.
- Computed values (overdue, active time, overall time, on-time, rates) are **not stored**. They are calculated in queries.
- Better Auth owns its own tables (`session`, `account`, `verification`, plus the base `user` table). The `account` table holds the password hash and the Google link. We never touch those directly. Exact extension mechanism for `user` to be verified in the current Better Auth docs.

Total: 20 tables of our own, plus Better Auth's.

---

## 1. Identity and access

### users (Better Auth `user` table, extended)

| Column | Type | Notes |
|---|---|---|
| id | uuid/text | Better Auth may use text IDs; follow the library |
| name | text, req | From signup or Google |
| email | text, req, unique | |
| email_verified | boolean | Provided by Better Auth (Google sets true) |
| image | text, opt | Google avatar |
| status | enum, req | pending, active, rejected, deactivated. Default pending |
| role_id | FK roles, opt | Null until approved |
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
| module | text, req | Grouping for the Admin page (classes, tasks, teams, admin) |
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
| status | enum, req | active, leave_requested, left, removed |
| joined_via_code_id | FK enrollment_codes, opt | |
| joined_at | timestamptz, req | |
| leave_requested_at | timestamptz, opt | |
| leave_reason | text, opt | |
| status_changed_at | timestamptz | |
| status_changed_by | FK users, opt | Faculty who approved or removed |

Constraint: unique (class_id, student_id). Rejoining reactivates the same row; the history of changes goes in `audit_logs`.

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
| closed_at | timestamptz, opt | Set when faculty close it manually or when it auto-closes |
| is_seed | boolean | |
| created_at, updated_at | timestamptz | |

### assignment_files

*(I left this table out of the earlier entity list; attachments need a link table.)*

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
| category | enum, req | assignment, study, project, reading, other | ~If its other then we need to write the category in the description box.
| priority | enum, req | low, medium, high. Default medium |
| status | enum, req | todo, in_progress, done. Default todo | ~ Can change the name to pending or keep it as todo. 
| source | enum, req | manual, assignment, ai_breakdown |
| deadline | timestamptz, opt | Current deadline |
| original_deadline | timestamptz, opt | Set the first time a deadline is set |
| reschedule_count | int, req | Default 0. Incremented when the deadline is moved later |
| estimate_minutes | int, opt | |
| estimate_source | enum, opt | user, history, ai |
| started_at | timestamptz, opt | First time status became in_progress; never overwritten |
| completed_at | timestamptz, opt | |
| deleted_at | timestamptz, opt | Soft delete |
| is_seed | boolean | |
| created_at, updated_at | timestamptz | |

Not stored, calculated: overdue, active time, overall time, on-time, planned-for-week.

Rules the database or code enforces:
- context = personal: assignment_id and team_id are null; assignee_id = created_by.
- context = assignment: assignment_id and assignee_id required; team_id null; unique (assignment_id, assignee_id) so a student never gets the same assignment twice.
- context = team: team_id required.
- status = done requires `completed_at`; status = todo requires it null (CHECK).
- A subtask's parent must itself be a top-level task with the same context and assignee (code).
- A parent cannot become done while any subtask is not done (code).

### task_events (append-only; see decision 4) ~ Yes we can do this!

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| task_id | FK tasks, req | |
| actor_id | FK users, req | |
| event_type | enum, req | created, status_changed, deadline_changed, reopened, deleted, restored |
| from_value | text, opt | |
| to_value | text, opt | |
| created_at | timestamptz | When it happened |

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
| submitted_at | timestamptz, req | |
| is_late | boolean, req | Snapshot at submission time against the deadline then in force |

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

### team_members ~ Is there no code for the team to join? How will they join otherwise?

| Column | Type | Notes |
|---|---|---|
| team_id | FK teams | Composite PK with user_id |
| user_id | FK users | |
| role | enum, req | creator, member |
| added_by | FK users | |
| joined_at | timestamptz | |
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
| size_bytes | bigint, req | | ~ We need to add a cap on the file size that we can decide later.
| uploaded_by | FK users, req | |
| created_at | timestamptz | |
| deleted_at | timestamptz, opt | |

Files are linked through `assignment_files` and `submission_files`. Access is decided by joining those links to classes and tasks; the file row itself has no permissions.

---

## 8. AI

### ai_suggestions

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | FK users, req | |
| task_id | FK tasks, opt | For breakdowns |
| kind | enum, req | breakdown, estimate, weekly_summary |
| model | text, req | e.g. llama3.2:3b |
| prompt_version | text, req | For comparing prompt versions in the evaluation |
| input_snapshot | jsonb, req | What was sent |
| output_raw | jsonb or text, opt | What came back |
| output_valid | boolean, req | Did it pass validation |
| latency_ms | int, opt | |
| items_suggested | int, opt | Subtasks suggested |
| items_kept | int, opt | Subtasks the student kept |
| outcome | enum, req | pending, accepted, edited, discarded, failed |
| created_at | timestamptz | |
| resolved_at | timestamptz, opt | |
- We can ask the users to give feedbacks as in ratings on how the response of the AI was and then based on those responses we can train the AI model to suggest correct breakdowns.
---

## Not stored on purpose

- **Growth Tracker numbers:** computed from `tasks` and `task_events`. Cached summaries only if queries turn out slow.
- **AI evaluation set (20 to 30 sample assignments):** kept as JSON files in the repo (`docs/` or `eval/`), not in the database.
- **Out of scope tables:** notifications, messages, comments, notes, milestones, calendar sync, workflows. ~ What is calendar sync used for? Wont we need it now for the MVP? If not now then when?

## Open design choices (answer these in chat)

1. **Do subtasks count in the metrics?** Proposal: metrics count only top-level tasks. Subtasks are steps toward them, so counting both would inflate rates.
2. **Keep `original_deadline`, `reschedule_count`, `estimate_source`?** They support honest metrics and the AI evaluation, at the cost of a few extra columns.
3. **Keep the `task_events` table?** (decision 4 in chat)
4. **Soft deletion rules for tasks** (decision 2 in chat).
5. **Category as a fixed list** (enum) rather than a user-editable table.
6. **One grade per task** (the latest edit wins) rather than a grade history.
7. **`is_late` stored per submission** as a snapshot, since faculty can later change a deadline.