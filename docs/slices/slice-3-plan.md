# Slice 3 plan: personal tasks

Written 26 Oct 2026 by Claude (Opus) for Claude (Sonnet), after Slice 2 was merged to `main` (`3944d28`). The owner reviews this plan before you start. `docs/decisions.md` wins if anything here disagrees with it; if you find a disagreement, stop and ask.

**Read first:** `CLAUDE.md`, `docs/decisions.md` (§17 and §18 for how Slices 1 and 2 were built), `docs/data-model.md` §4 (tasks, task_events, rules 1 to 5), `docs/data-flows.md` §2 (status and timestamp rules) and §7.1 (which tasks count in metrics), `docs/permissions.md` §4 and §5 (tier 1), `docs/color-palette.md` §5 and §6, and `docs/reviews/slice-2-opus-review.md`. Git stays the owner's job: never run a git command that changes anything.

---

## 1. Goal and exit check

**Goal:** a student can create personal tasks with subtasks, move them through To Do, In progress and Done, edit, delete and restore them, and every timestamp the Growth Tracker will later depend on (Slice 5) is recorded exactly by the rules.

**Exit check (`mvp-scope.md` §11: "Every rule in `data-flows.md` §2 tested"):**
1. Every rule in `data-flows.md` §2 that applies to personal tasks has a test, using a fixed clock (`setNowForTests`).
2. Every new action and page is in `tests/permissions/coverage.test.ts` and `tests/permissions/actions-matrix.test.ts`. The Slice 3 cases in `tests/unit/permissions/later-slices.test.ts` become real tests, and those `todo` lines are deleted.
3. `task_events` is append-only (the Slice 2 trigger function, reused).
4. The database CHECKs from `data-model.md` §4 exist and are tested.
5. The owner can do the whole flow in the browser, in light and dark mode, on a laptop and a phone-width window.
6. `typecheck`, `lint`, `test`, `test:e2e` and `npm audit` pass; the docs in section 7 are updated.

**Estimate:** 25 to 35 hours (`mvp-scope.md` §11).

## 2. Decisions the owner made for this slice (26 Oct 2026)

Record these in `decisions.md` in this slice.

1. **Secondary buttons (D4, closed): teal outline.** Secondary buttons use the outline style with the brand teal (`--brand` text and border, transparent fill), in both themes. Coral is kept as the 10% accent for one signature action: the "Break this down" AI button in Slice 4. Update `color-palette.md` §4 (the `--secondary` row and the open D4 note) and remove D4 from "Still open".
2. **Deadline: a date, with an optional time.** If no time is picked, the task is due at **23:59 on that day in the user's time zone** (`users.timezone`). Stored as UTC `timestamptz`.
3. **Deleting has two ways back:** an **Undo** button in the toast right after deleting, **and** a **Deleted** list from which any deleted personal task can be restored later. There is no permanent delete (soft delete keeps history, `data-model.md` rule 2).

## 3. Rules Opus proposes (confirm at checkpoint A)

The documents do not decide these, and each affects metrics or data. They are the defaults to build **only after the owner confirms them** at checkpoint A (section 5, step 1).

| # | Case | Proposed rule | Why |
|---|---|---|---|
| R-a | A subtask is started while its parent is To Do | The parent also moves to In progress and gets `started_at` (same moment, its own `status_changed` event) | Active time measures the parent; work on a step is work on the task |
| R-b | Adding a subtask to a Done parent | Refused: "Reopen the task to add steps" | A Done parent must have all subtasks done (`data-model.md` §4) |
| R-c | Reopening a subtask whose parent is Done | Refused: "Reopen the task first" | Same invariant |
| R-d | What a subtask has | Title, status, optional deadline (date with optional time, same as tasks), optional estimate. Category and priority are copied from the parent and follow it if the parent changes | Keeps subtasks light; matches "subtasks copy the parent's context" |
| R-e | A subtask deadline later than the parent's deadline | Allowed, with a warning on the form ("after the task's deadline") | Refusing would block reasonable plans; the warning is enough |
| R-f | Deleting a parent | Its subtasks are soft-deleted with it (same `deleted_at`, same reason, one `deleted` event each) | No orphan subtasks |
| R-g | Restoring | Restoring a parent restores the subtasks deleted **at the same moment** (equal `deleted_at`), not ones deleted earlier on their own. Restoring a subtask whose parent is still deleted is refused: "Restore the task first" | Undo means "put back exactly what one click removed" |
| R-h | Restore and metrics | Restoring clears `deleted_at` and `deleted_reason`; the task then counts normally. Writes a `restored` event | `data-flows.md` §7.1 looks only at the current deletion state |
| R-i | Limits (in `src/config/limits.ts`) | Title 1 to 200 characters; description up to 5,000; custom category label 1 to 40; estimate 1 to 6,000 minutes; at most 30 subtasks per task | Server-side limits, the lesson from the Slice 1 review (R1) |

## 4. What to build

### 3a. Schema (about 3 h). **Checkpoint A after this part.**

- `src/server/db/schema/tasks.ts`: enums `task_context` (personal, assignment, team), `task_category` (assignment, study, project, reading, other), `task_priority` (low, medium, high), `task_status` (todo, in_progress, done), `task_source` (manual, ai_breakdown), `estimate_source` (user, history, ai), `deleted_reason` (user_deleted, recipient_removed, assignment_cancelled), `task_event_type` (all nine values in `data-model.md` §4). Then the `tasks` and `task_events` tables exactly as in `data-model.md` §4.
- **Columns for tables that do not exist yet:** `assignment_id`, `team_id` and `ai_suggestion_id` are created now as plain nullable `uuid` columns **without** foreign keys. Slices 4, 7 and 11 add the foreign keys in their own migrations when the tables exist. That way the metric SQL in Slice 5 is written against the final shape of `tasks`.
- **CHECKs, all of them now** (from `data-model.md` §4): the three context shapes; `(status = 'done') = (completed_at IS NOT NULL)`; category other versus `category_other`; `deleted_at` and `deleted_reason` set together; `started_at <= completed_at`; `reschedule_count >= 0`; `estimate_minutes` within the limit. Partial unique index on (assignment_id, assignee_id) where `parent_task_id IS NULL`. Indexes: (assignee_id, deadline), (parent_task_id), (assignment_id), (team_id); `task_events` (task_id, created_at).
- A self-reference on `parent_task_id` (`AnyPgColumn`) with `ON DELETE RESTRICT`; rows are never hard-deleted.
- Migration `0003`: the generated tables, plus a hand-written part that adds the `task_events` append-only triggers with the existing `reject_append_only_change()` function. Never edit `0000` to `0002`.
- **Checkpoint A:** show the owner the schema file, the generated SQL and the answers to section 3 **before** running `db:migrate` on Neon. Migrations cannot be edited once applied, so this is the moment to change anything.

### 3b. Time handling (about 2 h)

- **Converting the form's local date and time to UTC is done by PostgreSQL**, not by hand-written JavaScript: `(date '2026-11-02' + time '23:59') AT TIME ZONE 'Asia/Kolkata'` gives the correct UTC instant, daylight saving included. Put it in one server helper, `src/server/tasks/time.ts` (`localToUtc(date, time | null, timezone)`), which runs that SQL. No new date library. (If this proves awkward, propose a library to the owner first; do not add one silently.)
- **Display** uses `Intl.DateTimeFormat` with the user's time zone, in `src/lib/time.ts` (`formatDeadline`, `isOverdue(deadline, status, now)`). "Overdue" is calculated: a deadline before `now()` on a task that is not done.
- Tests: midnight edges, a date-only deadline becomes 23:59 local, a non-Indian time zone with daylight saving (for example `Europe/London` in late March), and the display in two time zones.

### 3c. Rules and commands (about 8 to 10 h, the heart of the slice)

- `src/server/tasks/policy.ts`, the Slice 2 pattern:
  - **Relationship:** the task is `context = 'personal'` and `assignee_id = user.id`. Anything else is `not_found`. **Never** Admin read access: personal tasks are tier 1 (`adminMayRead(..., "personal")` is always false; the policy should not even call it).
  - **State:** each action's state rules from `data-flows.md` §2 and section 3 above (for example, not deleted; a parent is not Done when adding a subtask).
- `src/server/tasks/queries.ts`: every loader filters by `assignee_id = user.id AND context = 'personal'` **in the query** (security rule 3). `listMyTasks(scope, filter)`: top-level, not deleted, with subtask counts (done and total); filters: open (To Do and In progress), done, all; sorted by deadline (none last), then created. `getMyTask(scope, id)` with its non-deleted subtasks. `listMyDeletedTasks(scope)`.
- `src/server/tasks/commands.ts`: **the only place** that writes `tasks` and `task_events`. Each command: one transaction, lock the task row (`SELECT ... FOR UPDATE`, which is why the driver is `pg`), re-run the same rules on the locked row (as `admin/commands.ts` does), write, add the event or events, return. Commands:
  - `createTask` (with an optional list of subtask titles), `createSubtask`;
  - `updateTask` (title, description, category and custom label, priority, estimate), `changeDeadline` (sets `original_deadline` if empty, `reschedule_count + 1` only when moved later, event `deadline_changed`);
  - `startTask`, `moveBackToTodo`, `completeTask(completeAllSubtasks: boolean)`, `reopenTask`, `backfillStart(startedAt)` (between `created_at` and `completed_at`; event `start_backfilled`; refused if `started_at` is already set);
  - `deleteTask` (with R-f), `restoreTask` (with R-g and R-h).
- `src/lib/schemas/tasks.ts`: the Zod schemas (shared with the browser forms, as `decisions.md` §17 explains), using the limits from `src/config/limits.ts`.
- `src/app/(app)/tasks/actions.ts`: one server action per command, each shaped like the Admin Users actions (Zod, `authorizeRecord()` with `task.personal.manage`, one command, revalidate, return). `createTask` uses `authorize()` because there is no record yet.
- **Tests, written with the code:**
  - a table for `tasks/policy.ts` (every reason code and every allowed case);
  - a table of command tests with a fixed clock covering **every row and edge case of `data-flows.md` §2** for personal tasks: done, reopened, done again (`completed_at` is the latest, `started_at` the first); todo straight to done (no start); "complete all"; completing a parent with open subtasks without it (refused); moving a deadline earlier (no increment) and later (increment); a backfill outside the allowed window (refused); two tabs (the second change checked against the locked, current row);
  - section 3 rules R-a to R-i;
  - the CHECK constraints (insert bad rows directly and expect the database to refuse);
  - `task_events` UPDATE, DELETE and TRUNCATE refused.

### 3d. Screens (about 8 to 10 h)

Follow `color-palette.md` (§5 task states, §6 dark theme), the new teal-outline secondary buttons, and the layout from `decisions.md` §17. Words and icons for every state, never colour alone.

- **Menu:** "Tasks" for holders of `task.personal.manage`.
- **`/tasks`:** the list with Open, Done and All filters and a link to Deleted. Each card shows title, deadline (with "Overdue" when it applies), priority, category, a subtask count ("2 of 5 steps done") and the **primary action for its state**: To Do shows **Start** (the most prominent button), In progress shows **Mark done**, Done shows nothing (Reopen is on the detail page). A "New task" button opens a form: title, description, category (with the custom label when Other), priority, deadline date and optional time, estimate in minutes, and optional steps (subtask titles).
- **`/tasks/[taskId]`:** the task with its subtasks (each with its own Start and Done), edit, change deadline, delete, reopen. **Completing a parent with open subtasks** asks: "2 steps are not done. Complete them too?" with **Complete all** and **Cancel**. **Completing a never-started task** asks once: "When did you start? (optional)" with a date and time field limited to between creation and now, and **Skip**.
- **Delete:** a toast "Task deleted" with **Undo** (calls `restoreTask`); about 8 seconds.
- **`/tasks/deleted`:** deleted personal tasks, newest first, each with **Restore** (subtasks show "Step of: <task>" and are refused with "Restore the task first" if their parent is still deleted).
- **Dashboard:** unchanged in this slice (Slice 8).
- **Empty states:** a friendly first-task prompt on an empty list; "Nothing here" on empty filters.

### 3e. Permission coverage and docs (about 2 to 3 h)

- Add every new action and page to `coverage.test.ts` and `actions-matrix.test.ts` (all ten actor types). Required rows include: a student acting on **another student's** task (`not_found`); **Admin** opening or acting on a student's personal task (`not_found`); **Faculty** (personal tasks are off by default) gets `missing_permission`; a deleted task's actions (`not_found` or the state message, as designed).
- Move the three Slice 3 cases from `later-slices.test.ts` into real tests and delete them there.
- An optional second Playwright flow (create a task with two steps, start a step, see the parent In progress, complete all, delete and Undo) if time allows; otherwise note it for Slice 12.

## 5. How to work through it

1. **3a, then checkpoint A:** show the schema, the SQL and section 3. Wait for the owner's go-ahead **before applying the migration**.
2. 3b, 3c (tests with the code), 3d, 3e. After each part: run `typecheck`, `lint` and `test`; list the changed files; say what to try in the browser. The owner commits each part on `dev-Arjun`.
3. At the end: full checks, the docs below, and a reminder that the next required security review is after Slice 7. Because personal tasks are the first tier 1 data, also suggest an optional short Opus check of `tasks/policy.ts` and `tasks/queries.ts`.

## 6. Out of scope

AI breakdown and the estimate hint (Slices 4 and 9); metrics, the Growth Tracker and the dashboard content (Slices 5 and 8); assignment and team tasks (Slices 7 and 11; only their columns and CHECKs exist); foreign keys to `assignments`, `teams` and `ai_suggestions` (their slices); calendar views. If something here seems to need one of these, stop and ask.

## 7. Documents to update in this slice

- `decisions.md`: a new **§20 Slice 3 notes** after §18 (keep "Still open" last): the three owner decisions in section 2, the section 3 rules as confirmed, the PostgreSQL time conversion, the columns-without-foreign-keys approach. Remove D4 from "Still open".
- `data-flows.md` §2: add the confirmed rules R-a to R-h (subtask start, done parents, delete and restore) to the table and the edge-case list.
- `color-palette.md` §4: secondary buttons are teal outline; D4 closed.
- `folder-structure.md` §3: `src/server/tasks/` (policy, queries, commands, time), `src/lib/schemas/tasks.ts`, the new routes in §5.
- `permissions.md` §9: mark the personal-task cases as covered.
