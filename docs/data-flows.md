# CampusFlow AI: data flows and metric definitions

Version 0.4, 24 Oct 2026. Approved design, updated after the Opus review. Items marked **[Verify]** depend on a tool's current behaviour and are checked in the build phase. `decisions.md` wins if anything here disagrees with it. **Section 7 is the only place metrics are defined.**

Related documents: `mvp-scope.md`, `data-model.md`, `permissions.md`, `folder-structure.md`.

## What changed since v0.3

- Uploads stream the raw body to `/api/uploads`; downloads open inline in a CSP sandbox; files have one parent.
- Admin views read-only and never grades; only class Faculty grade.
- Submitting completes open subtasks too. Only the assignee changes a team task's status or deadline. "When did you start?" prompt.
- Metrics: `deleted_reason`, left-class rule, current-timeframe due set, monthly consistency, thresholds 5 and 10, contexts counted.
- Weekly summary is template-first; the model writes only suggestions, with no digits.
- New short flows: co-teachers, role changes, reset links, first Admin, team invitations without user enumeration.
- The data model gaps listed in v0.3 §9 are applied in `data-model.md` v0.5.

---

## 1. How to read a flow

Each flow lists the steps in order, the checks from the permission pipeline (signed in, active account, permission key, relationship, state), the tables touched, what runs inside one transaction, and the edge cases that become tests. Function names are descriptive, not final.

## 2. Task status and timestamps (the rules every metric depends on)

All task changes go through `server/tasks/commands.ts`.

| Change | Allowed for | What happens |
|---|---|---|
| todo to in_progress | Assignee | `started_at` set if empty (never overwritten); event `status_changed` |
| in_progress to todo | Assignee | Status changes; `started_at` kept; event |
| to done, personal or team task | **Assignee only** | Requires every subtask done, or the explicit "complete all" choice that completes the subtasks at the same moment. Sets `completed_at`; event. If `started_at` is empty, the UI asks once "When did you start?" (optional; any time between `created_at` and now). An answer sets `started_at` and writes `start_backfilled`; skipping leaves it empty |
| to done, assignment task | **Only by submitting** (section 4) | The student cannot mark it done by hand |
| done to todo or in_progress ("reopen") | Personal and team tasks, assignee only | `completed_at` cleared, `started_at` kept; event `reopened`. Assignment tasks cannot be reopened; faculty use `resubmission_until` |
| Deadline changed (personal, team) | Assignee only, **not while the task is Done** (reopen first) | `original_deadline` set if empty; `reschedule_count` + 1 if moved later; event `deadline_changed`. A deadline can be moved, never removed |
| Deadline changed (assignment task) | Faculty only, through the assignment (section 3) | All recipient tasks updated; event per task; `reschedule_count` unchanged |
| Edit title, description, priority, estimate (team task) | Any active member | Event not needed |
| Reassign (team task) | Any active member, to an active member | `assignee_id` changed; event `reassigned` |
| Delete | Personal tasks: owner. Team tasks: any active member | Soft delete, `deleted_reason = user_deleted`; event. Students cannot delete assignment tasks |
| Subtask created or completed | Assignee | One level only; copies the parent's context, assignee, assignment and team. Completing all subtasks does **not** auto-complete the parent |
| Subtask started, or completed straight from To Do, while the parent is To Do (R-a, R-a2) | Assignee | The parent also moves to In progress and gets `started_at` if empty (never overwritten), at the same moment, with its own `status_changed` event. The screen tells the person with a toast. Completing the last step still does not complete the parent |
| Subtask added to a Done parent (R-b) | Assignee | Refused: "Reopen the task to add steps". At most 30 steps per task (not counting deleted ones) |
| Subtask reopened while the parent is Done (R-c) | Assignee | Refused: "Reopen the task first" |
| Subtask category and priority (R-d) | Assignee | Copied from the parent; when the parent's change, every subtask follows (deleted ones too). A subtask has a title, status, optional deadline and estimate |
| Parent deleted (R-f) | Personal: owner | Its non-deleted subtasks are soft-deleted with it: same `deleted_at` and reason, one `deleted` event each |
| Restore (R-g, R-h) | Personal: owner | Clears `deleted_at` and `deleted_reason`; event `restored`. A parent also restores the subtasks whose `deleted_at` equals its own, not ones deleted earlier on their own. A subtask whose parent is still deleted is refused ("Restore the task first"), and so is a not-done subtask whose parent is Done ("Reopen the task first"). The task then counts normally in metrics (section 7.1 looks only at the current deletion state) |

Edge cases to test: done, reopened, done again (`completed_at` is the latest, `started_at` the first); completing a parent with open subtasks without confirmation (refused); moving a deadline earlier (no increment); a teammate changing the status of someone else's task (refused); a "When did you start?" answer after `completed_at` or before `created_at` (refused); two tabs changing the same task (the second change is checked against the current status, not the page's copy).

More edge cases for personal tasks (Slice 3, all tested): reopening to In progress a task that was never started gives it a start now; a deadline cannot be removed, only moved; the deadline of a Done task cannot be moved until it is reopened (a late task cannot become on time afterwards); moving a deadline to the same instant writes no event; completing a parent whose only open step is deleted is allowed; starting a step when the parent is already In progress leaves the parent alone; deleting a step on its own, then its parent, then restoring the parent leaves that step deleted; every action on a deleted task is refused until it is restored.

## 3. Posting and managing an assignment

**Action:** `postAssignment(actor, classId, input)`. Input: title, description, due date, optional close time, maximum marks, audience (all or selected), selected student IDs, attached file IDs.

1. **Validate** with Zod: lengths; due date in the future; close time not before the due date; maximum marks positive; selected IDs present when audience = selected; at most 20 files.
2. **Authorize:** active account; key `assignment.manage`; relationship: owner or co-teacher of this class (Admin never); state: the class is not archived.
3. **Resolve recipients:** audience = all means every `class_members` row with status `active` now; selected means each chosen student must be an active member (anyone else is rejected). At least one recipient.
4. **Check files:** each belongs to the actor, has purpose `assignment_attachment`, and is not attached.
5. **One transaction:**
   1. Insert the `assignments` row.
   2. Set `files.assignment_id` and `attached_at` on the attachments.
   3. Insert one top-level `tasks` row per recipient in one multi-row insert: context = assignment, created_by = faculty, assignee = student, `assignment_id`, category = assignment, status = todo, `deadline` and `original_deadline` = due date.
   4. Insert one `task_events` row (created) per task.
6. **Return** the assignment ID.

**Related actions** (all: key `assignment.manage`, class Faculty only)
- **Add recipients** (`addRecipients`): creates tasks only for new students; the partial unique index prevents duplicates. Later joiners are not added automatically.
- **Remove a recipient** (`removeRecipient`): only while that student has no submission. Soft-deletes their task with `deleted_reason = recipient_removed` (always excluded from metrics).
- **Edit:** title and description at any time. `max_marks` only while no grade exists. Attachments can be added and removed (`files.deleted_at`) until the first submission; after that only added.
- **Change the due date or close time:** updates every recipient task's `deadline` and logs `deadline_changed` per task. Lateness is never stored, so extending a deadline makes earlier "late" submissions on time everywhere at once.
- **Close now:** sets `closes_at` to now. New submissions are refused unless a task has a `resubmission_until` in the future.
- **Cancel:** only while the assignment has no submissions. Sets `assignments.deleted_at` and soft-deletes every recipient task with `deleted_reason = assignment_cancelled` (always excluded). With submissions, faculty close instead.
- **Student leaves or is removed from the class:** their tasks stay for history and are hidden from active lists; metric rule in section 7.1.

**Edge cases to test:** audience = selected with a student from another class (rejected); a student who left between page load and submit (not a recipient); double click (button disabled while pending); a co-teacher posting (allowed); a faculty member not listed for the class (not found); changing `max_marks` after a grade (refused); cancelling with a submission (refused); Admin posting (denied).

## 4. Submitting, resubmitting and grading

### 4.1 Submit or resubmit

**Action:** `submitWork(actor, taskId, input)`. Input: optional text, optional link, file IDs.

1. **Validate:** at least one of text, link or file; the link is http or https; text length limit; at most 20 files.
2. **Authorize:** active account; key `submission.create`; relationship: the actor is the assignee of this top-level task, context is assignment, and the actor is an active member of the class.
3. **State:** the assignment is not cancelled; and either `closes_at` is empty or in the future, or the task's `resubmission_until` is in the future.
4. **One transaction:**
   1. Lock the task row (`SELECT ... FOR UPDATE`) so two simultaneous submits cannot take the same version number. This needs a real transaction, which is why the driver is `pg`.
   2. `version` = highest existing version + 1.
   3. Insert the `submissions` row (lateness is calculated, not stored).
   4. Attach files: each belongs to the actor, has purpose `submission` and is not attached; set `files.submission_id` and `attached_at`.
   5. **Completion:** if the task is not done (first submission), set status = done and `completed_at` = now, complete any open subtasks at the same moment, and write `status_changed` events. If it is already done (resubmission), leave the status and `completed_at` alone, so the **first** submission time keeps deciding on-time.
5. **Return** the version number and whether it is late right now (calculated).

**Edge cases to test:** submitting at the exact close time; after close with and without `resubmission_until`; two simultaneous submissions (versions 1 and 2); only a file; resubmitting after a grade ("needs re-review"); another student's file ID (refused); a removed student submitting (not found); first submission with open subtasks (all completed).

### 4.2 Grade

**Action:** `gradeSubmission(actor, taskId, input)`. Input: marks, comment, optional submission ID (default: latest version).

1. Authorize: key `submission.grade`; the actor is owner or co-teacher of the task's class. **Admin is never allowed.**
2. State: the task has at least one submission; marks between 0 and `max_marks`.
3. Insert or update the single `grades` row (unique on task), recording the graded version, `graded_by` and the times.

### 4.3 Grant a resubmission window

`grantResubmission(actor, taskId, until)` sets `tasks.resubmission_until` (in the future), logs `resubmission_granted`, and leaves the task done. Authorized as for grading.

## 5. Files: upload, attach, download

Server actions accept only 1 MB bodies by default **[Checked 24 Oct 2026]**, so files use a route handler.

### 5.1 Upload (before the form is submitted)

1. The browser sends the file as the **raw request body** to `POST /api/uploads?purpose=<assignment_attachment|submission>&target=<classId|taskId>`, with the file name in a header (`X-File-Name`, URL-encoded) and its declared size.
2. **Authorize:** active account; key `file.upload`; relationship: for a submission, the actor is the assignee of that top-level assignment task and the assignment accepts submissions now; for an attachment, the actor is owner or co-teacher of that class. Check the `Origin` header matches the app's own address.
3. **Validate while reading:** refuse at once if the declared size is over the cap. Read `request.body` as a stream, counting bytes; stop and refuse as soon as the count passes `MAX_FILE_SIZE_BYTES`. Check the first bytes against the PDF (`%PDF-`), JPEG (`FF D8 FF`) and PNG (`89 50 4E 47 0D 0A 1A 0A`) signatures; anything else is refused (phone photos in HEIC get "please export as JPG"). Compute SHA-256 while streaming.
4. Write to local storage under a random key (a temporary name, renamed once complete); insert the `files` row with `attached_at` empty.
5. Return the file ID. The form passes it to the action in section 3 or 4.

The route is excluded from the `proxy.ts` matcher, because Next.js 16 buffers proxied bodies only up to 10 MB and silently truncates the rest **[Checked 24 Oct 2026]**.

`npm run files:cleanup` removes unattached files older than 24 hours (it also runs once when the server starts).

### 5.2 Download

1. `GET /api/files/[fileId]` (excluded from the `proxy.ts` matcher).
2. Load the file and its parent: assignment attachments allow recipients and class Faculty; submission files allow the submitter and class Faculty; Admin may read both (opening a submission file writes `submission_file.viewed` to `audit_logs`); an unattached file allows only its uploader. Deleted files are not found.
3. Not allowed: respond **not found** (404).
4. Allowed: stream the bytes with the stored content type and these headers:
   - `Content-Disposition: inline; filename*=UTF-8''<encoded name>` (control characters and quotes removed first). A "Download" button adds `?download=1`, which switches to `attachment`.
   - `X-Content-Type-Options: nosniff`
   - `Content-Security-Policy: sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'` **[Verify]** in Slice 7 that Chrome's and Edge's built-in PDF viewers still open PDFs under this policy. If they do not, serve PDFs with `attachment` (images stay inline) rather than weakening the policy.
   - `Cache-Control: private, no-store`

**Edge cases to test:** guessing another file's ID; a student removed from the class downloading an old attachment; a PDF renamed to .png (accepted as PDF, stored type PDF); a .exe renamed to .pdf (refused); a file 1 byte under and 1 byte over the cap (checksum intact, refused); a file name with quotes and a line break; a file attached twice (refused).

## 6. Accounts, classes and teams (short flows)

**Sign-up and welcome:** Better Auth creates the user (`status = pending`, no username). Any page sends a user without a username to `/welcome`: choose a username (checked inside our own action; Better Auth's `is-username-available` endpoint is disabled) and optionally a requested role, saved by our action. Then `/pending` until approved. The page states the privacy notice from `permissions.md` §5 rule 6.

**First Admin:** `npm run admin:promote -- <email>` finds the existing, signed-up user, refuses if an active Admin already exists, and in one transaction sets `status = active` and the Admin role and writes an audit row.

**Approval:** the Admin sees pending accounts with the requested role pre-filled and the email-verified badge. Approving requires a role. Keys: `admin.users.manage` and `admin.users.assign_role`. Audit row in the same transaction.

**Reset link (forgotten password):** the Admin chooses "Create reset link" for an active user. The server creates a one-time token with a 1-hour expiry (Better Auth's own reset-token mechanism if it can be used without sending email **[Verify]**; otherwise a hashed token in Better Auth's `verification` table), shows the link once, and writes `reset_link.created` to the audit log. The user opens `/reset-password/[token]`, sets a password, and all their sessions are ended.

**Reset a rejected account:** the Admin sets `status` back to pending; audited.

**Role change:** key `admin.users.assign_role`. Refused (with the list of blockers) if the user is owner or co-teacher of a non-archived class, or a requested, active or leave-requested class member, or an invited or active team member. Refused for the last active Admin and for oneself. Otherwise the role changes and an audit row is written in the same transaction.

**Deactivation:** sets `status = deactivated` and deletes the user's Better Auth `session` rows in the same transaction; audited. If the user owns classes or created teams, the Admin page offers the transfer actions.

**Request to join a class** (`requestToJoin(actor, code)`): normalise the code (upper case, no spaces); find an active, unexpired code of a non-archived class; limit wrong codes to 5 per 10 minutes per user (`rate-limit.ts`). Key `class.join`.
- No row yet, or status `left` or `removed`: the row becomes `requested` (approval on, the default) or `active` (approval off). A `removed` student is shown to the teacher with a "previously removed" note and always needs approval.
- Status `rejected`: the student cannot request again and sees "your request was declined".
- Status `requested` or `active`: nothing changes.
- **Teacher side:** a Requests tab with a badge count. Approve (`active`, `joined_at` set), decline (`rejected`), approve all, and reconsider from the Declined tab. Key `class.members.manage`, class Faculty only.

**Leave a class:** the student sets `leave_requested` with an optional reason; faculty approve (`left`, `left_at` set) or deny (back to `active`). Removal by faculty sets `removed` and `left_at`. Their tasks remain, hidden from active lists.

**Co-teachers:** the class owner enters the exact username or email of an active Faculty user; a `class_faculty` row (co_teacher) is inserted; audited. The owner can remove a co-teacher, or transfer ownership (the old owner becomes co-teacher). Key `class.manage`, owner only; Admin can also transfer ownership through `admin.override`.

**Team invitation:** the creator enters an exact email or username. If it belongs to an active **Student** who is not already active in the team, a `team_members` row is set to `invited`. **The reply is the same either way:** "If this person can be invited, they will see your invitation." At most 20 invitations per creator per hour. The invitee accepts (`active`) or declines (`declined`); only active members see the team. Members can leave (`left`); the creator can remove (`removed`). Admin can transfer the creator role to an active member (audited).

Pending invitations, join requests and leave requests are found by querying statuses; no notification table is needed.

## 7. Metrics (the only definitions)

Computed in PostgreSQL in `server/metrics/`. Thresholds live in `src/config/`.

### 7.1 Which tasks count

A task is **eligible** for a user when all of these hold:
- it is a **top-level** task (`parent_task_id` is empty); subtasks never count;
- `assignee_id` is the user; it may be a personal, assignment or team task (unassigned team tasks count for nobody);
- it is not excluded by deletion: if `deleted_at` is set, it counts only when `deleted_reason = user_deleted` **and** it was already completed, or already past its deadline, when deleted. `recipient_removed` and `assignment_cancelled` are always excluded;
- for an assignment task from a class where the user is now `left` or `removed`: it counts only if its deadline was before `class_members.left_at`.

### 7.2 Timeframes

A **day**, a **week** (Monday to Sunday) or a **calendar month**, in the **user's time zone**, converted to UTC bounds. ("Period" is not used, because students may confuse it with a lecture period.) `as_of` = the earlier of now and the timeframe end.
- For an **ended** timeframe the **due set** is eligible tasks with a deadline inside it. An ended timeframe's numbers never change afterwards, except when a deadline itself is changed later.
- For the **current** timeframe the due set is eligible tasks with a deadline between its start and `as_of`. Tasks due later in the timeframe are shown separately as "still to come".

### 7.3 Definitions

| Metric | Definition (within the timeframe, `as_of` applied) | Shown in |
|---|---|---|
| Due set | As in 7.2 | |
| Completion rate | Tasks in the due set completed by `as_of` ÷ tasks in the due set | Week, month |
| On-time rate | Tasks in the due set completed on or before their deadline ÷ tasks in the due set completed by `as_of`. Tasks without a deadline are never in the due set. (A task that is overdue and unfinished is not in the denominator; the completion rate captures it.) | Week, month |
| Average active time | Mean of `completed_at − started_at` over eligible tasks **completed** in the timeframe that have a start | Week, month |
| Average overall time | Mean of `completed_at − created_at` over eligible tasks completed in the timeframe | Week, month |
| Estimate accuracy | Per category, median of (active minutes ÷ estimate minutes) over eligible tasks completed in the timeframe with both a start and an estimate | Week, month |
| Rescheduling | Total `reschedule_count` ÷ number of tasks in the due set | Week, month |
| Consistency | **Month only.** A week belongs to the month that contains its Thursday. Among those weeks, count the weeks with at least one due task ("active weeks"); consistency = active weeks whose weekly completion rate is at least 70% ÷ active weeks. Needs at least 2 active weeks, otherwise "not enough data yet". The 70% is in `src/config/` | Month |
| Trend | The value minus the previous timeframe's value. Shown only when **both** timeframes have at least `TREND_MIN_WEEK` = 5 (week) or `TREND_MIN_MONTH` = 10 (month) completed eligible tasks | Week, month |

**Day view:** counts only: due today, done today, still open, overdue, plus a progress bar ("3 of 5 due today are done"). No rates, trends or AI.

These thresholds are product choices to avoid drawing conclusions from very few tasks, not statistical results.

### 7.4 Other queries

- **Student dashboard:** upcoming (not done, deadline within 7 days), overdue (not done, deadline passed), pending submissions (assignment tasks not done), this week's completion and on-time rates.
- **History-based estimate hint:** median active minutes of the user's last 10 completed eligible tasks in the same category, shown when at least 3 exist; category "other" gets no hint. No AI involved.
- **Class tracker (faculty):** per assignment, over non-deleted top-level recipient tasks: assigned, submitted (done), late (the first version's `submitted_at` is after the current deadline), graded, needs re-review, missing (not submitted and past due), submission rate.
- **Faculty dashboard:** the class tracker totals per class plus waiting join and leave requests.
- **Admin dashboard:** pending users and users by role.
- **Team progress:** done ÷ all non-deleted top-level team tasks.

### 7.5 Implementation notes

- Week and month bounds use PostgreSQL time zone functions (`date_trunc` with `AT TIME ZONE`), not application code, so the database and the tests agree. **[Verify]** that the chosen test database supports them.
- Indexes: see `data-model.md`. No caching until measured.
- Each metric has a test with a hand-calculated example (fixed timestamps and a fixed `now()`), including: no tasks, a task completed exactly at the deadline, a task without a deadline, each `deleted_reason`, a subtask, a reopened task, a task from a class the student left, the current week on a Wednesday, a month that starts on a Thursday, and a user in a different time zone.

## 8. The AI call path

All calls go through `server/ai/`. Everything runs locally; no data leaves the machine. Ollama listens only on `127.0.0.1`.

### 8.0 Model availability

- When the server starts, `warmup.ts` sends a tiny request with `keep_alive` (for example 30 minutes) so the first real request does not wait for the model to load. **[Verify]** the `keep_alive` and `options.num_ctx` request fields.
- A health check shows "AI is offline" in the UI when Ollama is not reachable; the rest of the app works without it.

### 8.1 Task breakdown

1. **Request:** `requestBreakdown(taskId)`.
2. **Authorize:** active account; key `ai.use`; the actor is the assignee of this top-level task (personal, assignment or team).
3. **Throttle:** one request per user at a time and a 10-second cooldown; a waiting queue of 3 for the single GPU. Queue full: "AI is busy, try again in a moment".
4. **Record:** insert an `ai_suggestions` row (kind breakdown, outcome pending) with the input snapshot and prompt version.
5. **Prompt:** title, description (cut to a fixed length), deadline, today's date, and the JSON schema as text. The user's text sits in a clearly delimited block and is treated as data; the model has no tools, so injected instructions can only change the wording.
6. **Call Ollama** with the JSON schema in `format` (generated from the Zod schema), non-streaming, temperature 0, context 4096, 60-second timeout. **[Checked 24 Oct 2026]** `format` accepts a JSON schema; Ollama recommends also putting the schema in the prompt and validating afterwards.
7. **Validate** with Zod: 3 to 10 items; titles 3 to 120 characters, no duplicates; minutes 5 to 600. Assume only Zod enforces counts and lengths. On failure retry once with a stricter reminder; if it fails again, mark `failed` and show "AI unavailable, add subtasks manually".
8. **Post-process in code:** spread suggested dates between today and the deadline in proportion to the minutes (no dates without a deadline).
9. **Return** the suggestions **unsaved**; the student edits, removes or adds items. Shown as plain text.
10. **Accept** (built as `createStepsFromBreakdown(actor, { taskId, suggestionId, items })` in `tasks/commands.ts`; the button is "Save steps"), in one transaction, with the task and the suggestion locked in that order: the suggestion belongs to the actor and is pending; create the subtasks (source ai_breakdown, estimate source ai, `ai_suggestion_id` set); set the outcome to accepted or edited (compared with the original), with counts and the resolution time. **Discard** sets discarded. A 1 to 5 rating and a comment can be added later.

Built in Slice 4: step 3 is `ai/queue.ts` (the pause counts from when a person's last job finished; a person refused by the line leaves no row); step 8 is `ai/dates.ts`; the model is never asked while a database lock is held; `input_snapshot` also keeps the list the student was shown, which "accepted" and "edited" are decided against (a row the student adds during the review is an ordinary manual step, not counted in `items_kept`). For browser tests only, `AI_FAKE_MODEL=yes` swaps the model for a fixed fake (`ai/fake-client.ts`); `src/env.ts` refuses it unless the database is the test database.

Failure cases: Ollama not running (health check message); first load slow (warm-up and a loading state); GPU busy (queue); invalid output (retry, then fail gracefully); the student closes the page mid-request (the row stays pending and shows as abandoned).

### 8.2 Weekly summary (template-first)

1. Authorize: key `ai.use`; the week has at least 3 tasks in its due set (otherwise only the metric tiles are shown).
2. Compute the metrics in SQL (section 7).
3. **Code writes the factual part** from templates, for example "You completed 7 of 9 tasks due this week (78%). 6 of them were on time." Every number in the summary comes from this step.
4. The model receives the metrics as labelled words and numbers and is asked, through a JSON schema `{suggestions: [string]}` with up to 3 items of at most 160 characters, for short, practical suggestions **without any numbers**.
5. **Digit check:** any suggestion containing a digit (0 to 9) is rejected. If all are rejected, retry once; then show the factual part alone.
6. Store the result as an `ai_suggestions` row (kind summary, timeframe week, `timeframe_start`). For an ended week, reuse the stored summary instead of calling again.
7. The monthly view (Slice 9) uses the same flow with timeframe month.

### 8.3 Evaluation

`npm run eval:ai` reads the 20 to 30 cases in `eval/cases.json`, runs each prompt version, validates the output and writes a table (valid output rate, subtask count, duration, manual score columns). Live acceptance, edit and discard rates come from `ai_suggestions`. For the friends test, add a short questionnaire (for example the System Usability Scale plus two questions about the breakdown).

## 9. Decisions

All items in this document are confirmed by the owner or recorded in `decisions.md` §14 as the outcome of the Opus review.
