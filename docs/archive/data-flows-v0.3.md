# CampusFlow AI: data flows for the tricky features (v0.3)

Phase 2, step 4. A design draft, **not** code. Not final until the owner approves it. Items marked **[Verify]** depend on a tool's current behavior and are checked in the build phase. Items marked **[Confirm]** are choices Claude made that the owner should check.

Related documents: `mvp-scope.md`, `data-model-draft.md`, `permission-model-draft.md`, `folder-structure-draft.md`.

Tracing the flows exposed **gaps in the data model**. They are collected in section 9 and will be folded into the next data model version.

---

## 1. How to read a flow

Each flow lists the steps in order, the checks from the permission pipeline (signed in, active account, permission key, relationship, state), the tables touched, what runs inside one database transaction, and the edge cases that become tests. Function names are descriptive, not final.

## 2. Task status and timestamps (the rules every metric depends on)

All task changes go through `server/tasks/commands.ts`, so these rules exist in exactly one place.

| Change | Allowed for | What happens |
|---|---|---|
| todo to in_progress | Assignee | `started_at` set if empty (never overwritten); event `status_changed` |
| in_progress to todo | Assignee | Status changes; `started_at` is kept; event |
| to done, personal or team task | Assignee (team: active member) | Requires every subtask done, or an explicit "complete all" choice that completes the subtasks at the same moment. Sets `completed_at`; event. Going straight from todo to done is allowed and leaves `started_at` empty |
| to done, assignment task | **Only through submitting** (section 4) | The student cannot mark it done by hand |
| done to todo or in_progress ("reopen") | Personal and team tasks only | `completed_at` cleared, `started_at` kept; event `reopened`. Assignment tasks cannot be reopened; faculty use `resubmission_until` |
| Deadline changed (personal, team) | Assignee or team member | `original_deadline` set if empty; `reschedule_count` + 1 if moved later; event `deadline_changed` |
| Deadline changed (assignment task) | Faculty only, through the assignment (section 3) | All recipient tasks updated; event logged; `reschedule_count` unchanged |
| Delete | Personal and team tasks | Soft delete (`deleted_at`); event. Assignment tasks cannot be deleted by students |
| Subtask created or completed | Assignee | One level only. Completing all subtasks does **not** auto-complete the parent |

Edge cases to test: done then reopened then done again (completed_at is the latest, started_at the first); completing a parent with open subtasks without confirmation (refused); moving a deadline earlier (no increment); two browser tabs changing the same task at once (the second change is checked against the current status, not the page's stale copy).

## 3. Posting an assignment to all or selected students

**Action:** `postAssignment(actor, classId, input)`. Input: title, description, due date, optional close date, maximum marks, audience (all or selected), selected student IDs, attached file IDs.

1. **Validate** with Zod: title and description lengths; due date in the future; close date not before the due date; maximum marks positive; selected IDs present when audience = selected.
2. **Authorize:** active account; key `assignment.post`; relationship: the actor is faculty of this class (owner or co-teacher), or Admin by override; state: the class is not archived.
3. **Resolve recipients:** audience = all means every `class_members` row with status `active` at this moment; selected means each chosen student must be an active member of this class (anyone else is rejected, so a faculty cannot send work to outsiders). At least one recipient is required.
4. **Check files:** each file belongs to the actor, was uploaded for assignment attachments, and is not yet attached (section 5).
5. **One transaction:**
   1. Insert the `assignments` row.
   2. Insert `assignment_files` rows and mark the files attached.
   3. Insert one `tasks` row per recipient in a single multi-row insert: context = assignment, created_by = faculty, assignee = student, `assignment_id`, category = assignment, status = todo, `deadline` and `original_deadline` = due date.
   4. Insert one `task_events` row (created) per task.
   5. If the actor is Admin acting by override, write the audit entry with the override flag.
6. **Return** the assignment ID; the page refreshes.

**Related actions**
- **Add recipients later** (`addRecipients`): creates tasks only for the new students; the unique rule on (assignment, assignee) prevents duplicates. Students who join the class after an assignment was posted do **not** receive it automatically.
- **Change the due date or close date:** updates every recipient task's `deadline` (all statuses) and logs `deadline_changed` per task. **Lateness is never stored.** It is always calculated by comparing a submission's time with the task's current deadline, so extending a deadline makes an earlier "late" submission on time everywhere at once (metrics, faculty list, student view), and no stale flag can disagree with the real deadline.
- **Close:** sets `closed_at`. Tasks are untouched; new submissions are refused unless a student has a `resubmission_until` window.
- **Cancel** (an assignment with no submissions yet): sets `deleted_at` on the assignment and its recipient tasks (gap 1 in section 9).
- **Student removed from the class:** their tasks stay for history and are hidden from active lists; the rule is derived from `class_members.status`.

**Edge cases to test:** audience = selected with a student from another class (rejected); a student who left the class between page load and submit (not a recipient); posting twice by double click (the button is disabled while pending, and a cancel action exists for mistakes); a co-teacher posting in a class where they are only a co-teacher (allowed); a faculty member posting in a class where they are not listed (refused, reported as not found).

## 4. Submitting work, resubmitting, and grading

### 4.1 Submit or resubmit

**Action:** `submitWork(actor, taskId, input)`. Input: optional text, optional link, file IDs.

1. **Validate:** at least one of text, link or file; the link must be http or https; text length limit; file count within the safety cap (20).
2. **Authorize:** active account; key `submission.create`; relationship: the actor is the assignee of this task, the task's context is assignment, and the actor is an active member of the class.
3. **State check:** the assignment is not deleted; either it is open (`now` before `closes_at` when set, and `closed_at` empty) or the task has a `resubmission_until` in the future.
4. **One transaction:**
   1. Lock the task row (`SELECT ... FOR UPDATE`) so two simultaneous submits cannot take the same version number.
   2. `version` = highest existing version + 1.
   3. Insert the `submissions` row. Lateness is not stored; it is calculated from `submitted_at` and the task's current deadline.
   4. Attach files: each must belong to the actor, be for submissions, and not already attached; mark them attached.
   5. **Completion.** Submitting is what completes an assignment task. The task is *not done yet* before the first submission (it is to do or in progress), and handing in the work is what changes it to done: set status = done, `completed_at` = now, and write a `status_changed` event. If the task is *already done* (this is a resubmission), leave the status and `completed_at` alone, so the **first** submission time keeps deciding on-time.
5. **Return** the version number and whether it is late right now (calculated).

**Edge cases to test:** submitting at the instant the assignment closes; submitting after close with and without `resubmission_until`; two simultaneous submissions (versions 1 and 2, not two version 1s); a submission containing only a file; resubmitting after a grade (allowed, the task shows "needs re-review" because the newest version is later than the graded one); another student's file ID (refused).

### 4.2 Grade

**Action:** `gradeSubmission(actor, taskId, input)`. Input: marks, comment, optional submission ID (default: the latest version).

1. Authorize: key `submission.grade`; the actor is faculty of the task's class, or Admin by override.
2. State: the task has at least one submission; marks between 0 and the assignment's maximum.
3. Insert or update the single `grades` row for the task (unique on task), recording the graded version, `graded_by` and times. Audit entry if an override.

### 4.3 Grant a resubmission window

`grantResubmission(actor, taskId, until)` sets `tasks.resubmission_until`, logs `resubmission_granted`, and leaves the task Done. Authorize as for grading.

## 5. Files: upload, attach, download

**Why uploads use a route handler:** Next.js server actions have a small default request body limit, so files go through a dedicated upload route handler instead of a server action. **[Verify]**

### 5.1 Upload (before the form is submitted)

1. The browser sends the file with its purpose (assignment attachment or submission) and the target (class ID or task ID) to the upload route.
2. **Authorize:** active account; key `file.upload`; relationship: for a submission, the actor is the assignee of that task; for an attachment, the actor is faculty of that class.
3. **Validate:** size within the configured cap (checked while reading, so an oversized file is stopped early); type decided from the **file's content** (PDF, JPEG and PNG signatures), not the file name or the browser's claim. Phone photos in HEIC format are refused with a message to export as JPG.
4. Save through the storage layer under a random key; insert the `files` row with `attached_at` empty.
5. Return the file ID. The form later passes the ID to the action in section 3 or 4.

Files never attached (the user left the page) are cleaned up by a script, `npm run files:cleanup`, which removes unattached files older than 24 hours (no scheduler is needed on a laptop; it can also run at app start).

### 5.2 Download

1. Request to `/api/files/[fileId]`.
2. Load the file and the record it is attached to: assignment attachments allow recipients, class faculty and Admin; submission files allow the submitter, class faculty and Admin; an unattached file allows only its uploader.
3. Not allowed: respond "not found".
4. Allowed: stream the bytes with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and the stored content type, so an uploaded file can never run as a web page. In Cloudinary mode, issue a short-lived signed link after the same checks. **[Verify]**

Edge cases to test: guessing another file's ID; a student removed from the class downloading an old attachment; a PDF renamed to .png; an oversized file; a file attached twice.

## 6. Join, leave, and team invitations (short flows)

**Request to join a class** (`requestToJoin(actor, code)`): normalize the code (case, spaces); find an active, unexpired code of a non-archived class; limit repeated wrong codes per user (for example 5 per 10 minutes). A code only opens a **request**; the teacher decides who gets in.
- No row yet, or status `left` or `removed`: the row becomes `requested` (when the class has approval turned on, which is the default) or `active` (when the teacher turned approval off for that class). A `removed` student is shown to the teacher with a "previously removed" note.
- Status `rejected`: the student cannot request again on their own and sees "your request was declined". The teacher can reconsider from the Declined tab.
- Status `requested` or `active`: nothing changes.
- **Teacher side:** a Requests tab on the class members page, with a badge count. Approve (status `active`, `joined_at` set), decline (status `rejected`), or approve all. Authorize with `class.members.manage`; Admin by override.
- Earlier assignments are not assigned automatically to students who join later.

**Sign-up and approval:** a new account is `pending` with no role. On the one-time welcome screen the person picks a username and optionally a requested role (Student or Faculty; leave blank if unsure or if they will be an Admin), saved in `users.requested_role`. The Admin sees pending accounts with the requested role pre-filled in the role selector. Approving requires a role in `role_id`; the Admin can accept the suggestion or change it. The first Admin comes from the seed script, and further Admins are made by an existing Admin. The requested role never grants access by itself. Authorize with `admin.users.approve` and `admin.users.assign_role`; audit entry in the same transaction.

**Leave:** student sets `leave_requested` (with an optional reason); faculty approve (status `left`) or deny (back to `active`). Their tasks remain, hidden from active lists.

**Team invitation:** the creator finds a user by exact email or exact username (no browsable list); `team_members` row with status `invited`; the invitee accepts (active) or declines; only active members see the team. Pending invitations and pending leave requests are found by querying statuses, so no notification table is needed.

## 7. Metrics queries

All metrics are computed in PostgreSQL from `tasks` (plus `task_events` where noted), in one module, `server/metrics/`.

### 7.1 Which tasks count

A task is **eligible** when:
- it is a top-level task (`parent_task_id` is empty), so subtasks never count;
- it is not excluded by deletion. A deleted task counts only if it was already completed, or already past its deadline, when it was deleted; otherwise it is excluded. This refines the earlier rule so deleting a done task cannot be used to change history. (Confirmed by the owner.)

### 7.2 Timeframes

A timeframe is a **day**, a **week** (Monday to Sunday) or a **calendar month**, all in the **user's timezone**, converted to UTC bounds. (The word "timeframe" is avoided because students may confuse it with a lecture timeframe.) `as_of` = the earlier of now and the timeframe end, so a closed timeframe never changes after it ends, and the current timeframe grows as the week goes on. (Confirmed by the owner. This refines "done" in the completion rate definition.)

### 7.3 Definitions

| Metric | Definition (within the timeframe, `as_of` applied) |
|---|---|
| Due set | Eligible tasks with a deadline inside the timeframe |
| Completion rate | Tasks in the due set completed by `as_of` ÷ tasks in the due set |
| On-time rate | Tasks in the due set completed on or before their deadline ÷ tasks in the due set completed by `as_of` (tasks without a deadline are never in the due set) |
| Average active time | Mean of `completed_at − started_at` over tasks completed in the timeframe that have a start |
| Average overall time | Mean of `completed_at − created_at` over tasks completed in the timeframe |
| Estimate accuracy | Median of active minutes ÷ estimate minutes, per category, over completed tasks that have both |
| Rescheduling | Total `reschedule_count` ÷ number of tasks with a deadline in the timeframe |
| Consistency | Share of weeks in the timeframe that have at least one due task and a weekly completion rate of at least 70% |
| Trend | Value minus the previous timeframe's value, shown only when the timeframe has at least 10 completed tasks |

**Daily timeframe.** A day has too few tasks for rates or trends to mean anything, so the daily view shows **counts only**: due today, done today, still open, overdue, plus a simple progress bar ("3 of 5 due today are done"). It never shows a trend or an AI summary. The weekly and monthly views carry the rates, trends and AI summary, with the 10-completed-task minimum.

### 7.4 Other queries

- **Dashboard (student):** upcoming (not done, deadline within 7 days), overdue (not done, deadline passed), pending submissions (assignment tasks not done), plus the rates above for the current week.
- **History-based estimate hint:** median active minutes of the user's last completed tasks in the same category, when there are at least 3; otherwise nothing is shown. Category "other" gets no hint.
- **Class tracker (faculty):** per assignment: assigned (non-deleted recipient tasks), submitted (done), late (the first version's `submitted_at` is after the task's current deadline), graded, missing (not submitted and past due).
- **Admin dashboard:** counts of pending users and users by role.

### 7.5 Implementation notes

- Week and month buckets use PostgreSQL time zone functions, not application code, so the database and the tests agree.
- Indexes: `tasks (assignee_id, deadline)`, `tasks (assignment_id)`, `tasks (parent_task_id)`, `submissions (task_id, version)`, `task_events (task_id, created_at)`. No caching until measured.
- Each metric has a test with a hand-calculated example (fixture tasks with fixed timestamps and a fixed `now()`), including: no tasks, a task completed exactly at the deadline, a task without a deadline, a deleted task, a subtask, a task reopened and completed again, and a user in a different timezone.

## 8. The AI call path

All calls go through `server/ai/`. Everything runs locally; no data leaves the machine.

### 8.1 Task breakdown

1. **Request:** `requestBreakdown(taskId)`.
2. **Authorize:** active account; key `ai.breakdown.use`; the actor may edit this task (their personal task, their assignment task, or a team task they belong to); the task is top-level (subtasks cannot have subtasks).
3. **Throttle:** one request per user at a time and a short cooldown; a small waiting queue for the single GPU (for example 3 deep). If the queue is full: "AI is busy, try again in a moment".
4. **Record:** insert an `ai_suggestions` row (outcome pending) holding the input snapshot and prompt version.
5. **Prompt:** title, description (cut to a fixed length), deadline, today's date. The user's text is placed in a clearly delimited block and treated as data; the model has no tools, so injected instructions cannot do anything except change the wording of the suggestions.
6. **Call Ollama** with a JSON schema for the answer, non-streaming, low temperature, 4096 context, 60-second timeout. **[Verify]** the current request fields.
7. **Validate** with Zod: 3 to 10 items; titles 3 to 120 characters, no duplicates; minutes 5 to 600. On failure retry once with a stricter reminder; if it fails again, mark the row `failed` and show "AI unavailable, add subtasks manually".
8. **Post-process in code:** spread suggested dates between today and the task's deadline in proportion to the estimated minutes (no dates if the task has no deadline). The model never does date arithmetic.
9. **Return** the suggestions to the page, **unsaved**. The student edits, removes or adds items.
10. **Accept** (`acceptBreakdown(suggestionId, items)`), in one transaction: the suggestion must belong to the actor and be pending; create the subtasks (source = ai_breakdown, estimate source = ai); set the row to accepted or edited (by comparing with the original output), with the counts of suggested and kept items and the resolution time. **Discard** sets discarded. A 1 to 5 rating and a comment can be added later.

Failure cases: Ollama not running (a health check explains this); the model loading for the first time (slow first answer, with a visible loading state); the GPU busy (queue); invalid output (retry, then fail gracefully); a student closing the page mid-request (the row stays pending and is shown as abandoned).

### 8.2 Weekly summary

1. Authorize: `ai.summary.use`; the timeframe has at least 10 completed tasks (otherwise no AI call).
2. Compute the metrics in SQL (section 7); build a small JSON object with only those numbers.
3. Call the model asking for a short summary and up to three suggestions, as a JSON schema.
4. **Number check:** every number in the generated text must appear among the input numbers; if not, retry once, then show the plain metrics without text.
5. Store the result as an `ai_suggestions` row of kind weekly_summary. For a closed timeframe, reuse the stored summary instead of calling again.

### 8.3 Evaluation

`npm run eval:ai` reads the 20 to 30 cases in `eval/cases.json`, runs each prompt version, validates the output, and writes a table (valid JSON rate, subtask count, duration, manual score columns). Prompt versions are saved in `ai_suggestions.prompt_version` so live acceptance data can be compared too.

## 9. Gaps found in the data model (to apply in the next version)

| # | Gap | Proposed change |
|---|---|---|
| 1 | An assignment cannot be cancelled | Add `assignments.deleted_at`; cancelling also soft-deletes its recipient tasks |
| 2 | Uploaded files have no "attached or not" state, so abandoned uploads cannot be found | Add `files.purpose` (assignment_attachment, submission) and `files.attached_at` |
| 3 | Weekly summaries cannot be looked up by timeframe | Add `ai_suggestions.timeframe_start` (date, optional) |
| 4 | AI-created subtasks cannot be traced to their suggestion, so "were the suggested subtasks actually completed" cannot be measured | Add `tasks.ai_suggestion_id` (optional foreign key) |
| 5 | Metric rule refinements | The deleted-task counting rule (7.1), the `as_of` rule for timeframes (7.2), and deadline extension recomputing on-time (3). Documented in the rules, no new columns |
| 6 | Removed students must not rejoin by code | Already supported by `class_members.status`; the rule is now explicit in section 6 |
| 7 | A stored `submissions.is_late` can disagree with the deadline after faculty change it | **Remove the column.** Calculate lateness from `submitted_at` and the task's current deadline (decided by the owner) |
| 8 | Joining a class by code needs teacher approval | Add statuses `requested` and `rejected` to `class_members.status`, add `class_members.requested_at`, add `classes.requires_approval` (boolean, default true) |
| 10 | Requested role at sign-up | Add `users.requested_role` (student, faculty, or empty), a hint for the Admin only |
| 9 | Team and class lookups by username | Add `users.username` (unique, case-insensitive), chosen by every user at first sign-in, including Google sign-ups |

## 10. Decisions

All items in this document are confirmed by the owner:

1. Lateness is calculated, never stored.
2. Deleted-task counting rule (section 7.1).
3. A timeframe ends at its end date and never changes afterwards; the current one grows (section 7.2). Day, week and month timeframes.
4. Joining by code creates a request that the teacher approves or declines; declined students stay outside until the teacher reconsiders (section 6).
5. Data model changes in section 9, rows 1 to 10.
6. Sign-up asks for a username and an optional requested role; the Admin approves and decides the role (section 6).
