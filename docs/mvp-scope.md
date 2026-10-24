# CampusFlow AI: MVP scope (build brief)

Version 3, 24 Oct 2026. Replaces v2 (now in `archive/`). Phases 0 to 2 are complete and the Opus review has been applied. `decisions.md` wins if anything here disagrees with it.

This document says **what** is built and in which order. The detailed rules live in one place each: tables in `data-model.md`, permissions in `permissions.md`, flows and **metric definitions** in `data-flows.md`, conventions in `folder-structure.md`, colours in `color-palette.md`.

---

## 0. How to use this document (read this first, Claude)

1. **The owner wants to understand the system**, not receive a pile of generated code. Explain each design decision and its trade-offs before writing code, briefly.
2. **Work in small vertical slices** (section 11). Do not start the next slice before the current one meets its exit check.
3. **Claude writes most of the code; the owner reviews, runs and tests it.** Give code in reviewable pieces. For auth, permissions and file handling, point out the lines the owner must read carefully.
4. **Verify current documentation** for Next.js 16, Better Auth, Drizzle, Neon and Ollama before using their APIs.
5. **All permission checks happen on the server.** Hiding a button is never security.
6. **Keep `docs/decisions.md` current:** one line per new decision with the reason.
7. **Do not add features outside this scope.** Put ideas in section 10.
8. **Be honest about uncertainty.** Say when something is an estimate, a guess or unverified.
9. The owner uses **Windows and PowerShell**. Give commands that work there.

---

## 1. Goal

One platform where students and faculty manage academic work and personal tasks together. An AI assistant makes large tasks less intimidating by breaking them into smaller steps, and a Growth Tracker shows how a student's productivity changes over time, using numbers computed from real data (the AI never produces a number).

Evaluation: working demo, report, viva, novelty. First demo after January or February 2027; final deadline later in 2027. Solo project.

## 2. Environment and stack

| Item | Choice |
|---|---|
| Framework | Next.js 16 (App Router) with TypeScript strict |
| Database | PostgreSQL: Neon free tier, plus a local PostgreSQL as the demo fallback |
| ORM | Drizzle ORM with the `pg` driver |
| Auth | Better Auth (email and password, Google) |
| UI | Tailwind CSS and shadcn/ui, tokens from `color-palette.md` |
| AI | Llama 3.2 3B through Ollama on the owner's laptop |
| File storage | Local disk behind a storage interface |
| Repo | `C:\dev\campus-flow-ai` (outside OneDrive) |

Laptop: ASUS TUF F15, Core i5-11400H, 16 GB RAM, 4 GB GPU. Measured with `llama3.2:3b`: about 39 tokens per second, about 4.4 s for an 8-subtask answer, 80% GPU / 20% CPU, context 4096. Keep prompts short.

## 3. Roles and account lifecycle

Roles: **Admin, Faculty, Student.** What each role may do is stored as role-to-permission rows and edited from the Admin page within fixed limits (`permissions.md` §3).

1. A person signs up with Google or with email and password (passwords hashed by Better Auth).
2. On a one-time **welcome** screen they choose a username and optionally a requested role (Student or Faculty).
3. The account is **pending** until an Admin approves it and chooses the role, or rejects it. Admins can deactivate accounts later.
4. The first Admin: the owner signs up, then runs `npm run admin:promote -- <email>` once.
5. No email is sent in the MVP. The approval page shows whether the email is verified; forgotten passwords are handled by an Admin reset link.

Visibility follows three tiers (personal, academic, team). Admin may view academic and team records read-only and can only transfer class ownership and team creators; personal data is private to its owner. Details: `permissions.md` §5.

## 4. Functional scope (in)

### 4.1 Personal tasks (students)
- Title, description, optional deadline, priority (Low, Medium, High), status (To Do, In progress, Done), optional estimate in minutes, category (Assignment, Study, Project, Reading, Other with a custom label).
- Subtasks one level deep. "Overdue" is calculated, not a status.
- "Start" is the obvious first action; completing a never-started task asks once "When did you start?" (optional).
- Faculty cannot see students' personal tasks. Personal tasks and teams are for students (the Admin can enable personal tasks, the tracker and AI for Faculty later).

### 4.2 Classes
- Faculty create classes. A class has one owner and optional co-teachers, added by exact username or email.
- **Enrollment codes:** 8 characters without look-alike characters, expiry of 1, 7 or 30 days (default 7), can be deactivated or replaced at any time. Expiry does not remove members.
- A code creates a **join request** that the teacher approves or declines (per-class setting, default on). Declined or removed students stay outside until the teacher reconsiders.
- Faculty can remove a student. A student **asks to leave** and the teacher decides.
- Tasks from a class a student left stay for history, are hidden from active lists, and are excluded from metrics if they were due after the student left.

### 4.3 Assignments, submissions and grading
- Faculty post to **all active members or selected members**, with title, description, due date, optional close time, maximum marks and attachments. Each recipient gets their own task. Later joiners can be added as recipients.
- Students submit text, a link and/or files. Late submissions are accepted and shown as late (calculated, never stored).
- **Resubmission** until the close time, or later if faculty grant a resubmission window to one student. Every version is kept; the latest is graded; the **first** submission time decides on-time.
- Faculty grade with marks out of the maximum and a comment, and can edit a grade. Students see both. Faculty see per student: not submitted, submitted, late, graded, needs re-review.
- An assignment with no submissions can be cancelled; once it has submissions it can only be closed. Maximum marks are locked once any grade exists.

### 4.4 Files
- PDF, JPG and PNG only, at most 10 MB each and 20 per assignment or submission (settings in `src/config/`).
- Type checked from the file's content. Stored on local disk under random keys, outside `public/`.
- Every download goes through a permission-checked route. Details: `data-flows.md` §5.

### 4.5 Teams
- Independent of classes. The creator invites active students by exact email or username; invitees accept or decline.
- Any active member creates tasks and assigns them to any member. Only the assignee changes a task's status or deadline.
- Team progress = done top-level tasks ÷ all top-level tasks (not deleted).

### 4.6 Dashboards
- **Student:** upcoming and overdue tasks (all contexts), pending submissions, this week's completion and on-time rates.
- **Faculty:** per class: assigned, submitted, late, graded, join requests waiting.
- **Admin:** pending approvals, user counts by role.

### 4.7 AI (section 8) and Growth Tracker (section 9)

## 5. Business rules

The rules are defined once:
- Task status, timestamps, reopening, deadlines and deletion: `data-flows.md` §2 and `data-model.md` §4 (rules).
- Metrics (completion, on-time, active time, overall time, estimate accuracy, rescheduling, consistency, trends): `data-flows.md` §7.
- Lateness: calculated from `submitted_at` against the current deadline; never stored.

## 6. Permissions

See `permissions.md`. In short: 23 keys with eligible roles, a five-step server-side check, relationships fixed in code, three privacy tiers.

## 7. User stories

**Everyone:** I can sign up with Google or email and password, choose a username, say whether I am a student or a teacher, see that my account is waiting, and sign in once approved.

**Admin:** I approve or reject accounts and choose their role. I change roles and deactivate accounts. I edit which permissions each role has, within the allowed cells. I create reset links. I can view any class or team read-only and transfer ownership if a teacher or team creator is gone. I read the audit log. I never see anyone's personal tasks or Growth Tracker.

**Faculty:** I create a class, add co-teachers and generate join codes with an expiry. I approve or decline join requests and leave requests, and remove students. I post assignments to all or selected students, with files. I see who submitted, who is late and who is missing, grade with marks and a comment, and allow a resubmission. I see my class tracker.

**Student:** I create tasks with deadlines, priorities and subtasks and move them through To Do, In progress and Done. I press "Break this down" and edit the AI's steps before saving them. I join classes by code, receive assignments, submit text, links and files, resubmit until the close time, and see my grade. I ask to leave a class. I create teams, invite classmates and assign team tasks. I see my dashboard and my Growth Tracker by day, week and month, with a plain-language summary.

## 8. AI (students only by default)

- **Model:** `llama3.2:3b` via Ollama, behind a thin interface so the model can be swapped. Kept loaded with `keep_alive` and warmed up when the app starts.
- **Breakdown** on any top-level task the student may edit. Input: title, description, deadline, today's date. Output forced to a JSON schema: `{subtasks: [{title, estimated_minutes, order}]}`, 3 to 10 items. Validated with Zod, one retry, then "AI unavailable, add subtasks manually". The student edits and accepts before anything is saved. Code assigns dates.
- **Estimate hint (no AI):** the median active time of the user's last completed tasks in that category, shown when there are at least 3.
- **Weekly summary:** code writes the sentences with numbers from the computed metrics; the model writes up to three short suggestions; any model output containing a digit is rejected and only the code-written part is shown.
- One request at a time (queue), 60 s timeout, visible loading state, English only.
- Every suggestion is logged with its outcome (accepted, edited, discarded, failed) and an optional rating, for the report's evaluation. An evaluation set of 20 to 30 sample assignments with a scoring rubric (`eval/cases.json`).
- Prioritisation, conflict and overload detection and project planning by AI are later.

## 9. Growth Tracker

- **Student view:** day (counts only), week and month. Metrics: completion rate, on-time rate, average active time, average overall time, estimate accuracy by category, rescheduling, and (monthly) consistency, each compared with the previous timeframe.
- Trends need at least 5 completed tasks (week) or 10 (month) in both timeframes; otherwise "not enough data yet".
- All numbers come from SQL on real data, defined in `data-flows.md` §7.
- **Class tracker (faculty):** per assignment: assigned, submitted, late, graded, missing, submission rate. No personal data.
- **Seed data:** `npm run seed:demo` creates simulated users with a few months of history. Simulated users carry `is_seed`, the UI shows a "Simulated data" banner on their data, and the report states which data is simulated.

## 10. Out of scope for now (later list)

Communication (announcements, messaging, discussions), shared notes, notifications and email of any kind, CSV bulk import, workflow-based resubmission locking, faculty viewing students' personal tasks, per-user custom permissions, per-student deadline extensions, team assignments, team join codes, direct add of students by username, project milestones, AI prioritisation and conflict detection, external calendar sync, real-time collaboration, Cloudinary or other cloud storage, public deployment, faculty-side AI.

## 11. Build slices

A slice is **done** only when: schema and logic exist, its tests pass (including the permission cases it touches), `typecheck` and `lint` pass, the owner can explain it, and `docs/decisions.md` is updated.

| # | Slice | Exit check | Hours (estimate) |
|---|---|---|---|
| 0 | Setup: Next.js in the existing repo, `pg` driver, Neon and local Postgres, `env.ts`, lint rules, Vitest, CI, theme tokens | App runs, a migration applies, CI passes | 10 to 15 |
| 1 | Auth: email and password and Google, welcome (username, requested role), pending, approval page with email-verified badge, `admin:promote`, Better Auth hardening, settings page (time zone, password) | Pending user blocked; `update-user` cannot change status or role | 23 to 35 |
| 2 | `authorize()` pipeline, permission keys with eligible roles and default grants (grid read-only for now), audit writes and triggers, permission test harness | Table-driven tests run | 12 to 18 |
| 3 | Personal tasks, subtasks, statuses, timestamps, task events, "When did you start?" | Every rule in `data-flows.md` §2 tested | 25 to 35 |
| 4 | AI breakdown on personal tasks, queue, warm-up, `eval:ai` with the first 10 cases | Invalid output never saved; evaluation table produced | 25 to 40 |
| 5 | Metrics, Growth Tracker (day and week), `seed:demo` | Hand-calculated fixtures pass | 30 to 45 |
| | **Checkpoint A** (about the end of December 2026): plan, break down with AI, see growth | | ≈ 125 to 190 |
| 6 | Classes, co-teachers, codes, join requests, leave requests, removal | Expired code refused; declined student stays out | 25 to 35 |
| 7 | Assignments, recipients, submissions, files (upload and download), grading, resubmission windows, AI breakdown on assignment tasks | Unauthorised file access not found; versions correct; file under the cap intact | 40 to 60 |
| 8 | Class tracker, faculty dashboard, student dashboard, `seed:demo` extended with a demo class and submissions | Numbers match fixtures | 12 to 18 |
| | **Checkpoint B** (first university demo): the full faculty-to-student loop as well | | ≈ 200 to 300 |
| 9 | Month view, consistency, weekly summary with AI suggestions, estimate hint | No model-written number ever shown | 15 to 25 |
| 10 | Admin completion: permission grid editing, Admin read-only views and transfers, reset links, audit viewer, **deactivate and reactivate users (deleting their sessions in the same transaction)**, **role change (refused while the blockers in `permissions.md` §6 rule 8 exist)**, **reset a rejected account to pending** | A grid change works on the next request; ineligible grants refused; a deactivated user's open session is refused at once; a role change with a blocker is refused with the blockers listed | 18 to 28 |
| 11 | Teams: invitations, team tasks, former members, AI breakdown on team tasks | Only active members see team tasks; only the assignee changes status | 30 to 45 |
| 12 | Hardening: security review, friends test through the tunnel, demo setup with the local fallback, documentation | Full demo run from the laptop with the network off | 25 to 40 |

## 12. Effort and calendar (estimates, not measurements)

- Build: about **280 to 430 focused hours**. Report, evaluation write-up and viva preparation: another **40 to 60 hours**, written slice by slice.
- Available at about 21 planned hours a week and an 85% realisation rate: about **18 realised hours a week**, so roughly 250 hours by 1 February 2027.
- Checkpoint A needs about 125 to 190 hours (roughly 7 to 11 weeks from 26 Oct 2026). Checkpoint B needs about 200 to 300 hours (roughly 11 to 17 weeks), which is around or after the start of February. Re-estimate after Slice 3 using the real pace.
- **If time runs short, cut in this order:** (1) the month view and consistency, (2) the permission grid editing (keep the seeded defaults), (3) team invitations (creator adds members directly), (4) leave requests (faculty removal only), (5) the estimate hint. The **must-demo core** is: sign-up with approval, personal tasks with subtasks, AI breakdown with edit-before-save, Growth Tracker week view with labelled seed data, one class with one assignment submitted and graded, and a live demonstration that a student cannot open another student's file.

## 13. Resolved confirmations (from v2 §13)

1. A class has one owner plus optional co-teachers. Confirmed.
2. Personal tasks and teams are student-only by default. Confirmed (Faculty eligible later for personal tasks).
3. Admins can view submissions read-only; they cannot edit them. Changed by the Opus review (P2).
4. Safety cap of 20 files per assignment or submission. Confirmed.
5. Code expiry: default 7 days, stored as `expires_at`, no scheduler. Confirmed.
6. Estimate hints are computed from history only. Confirmed; no AI estimate.
7. Later joiners do not receive earlier assignments automatically. Confirmed.
8. Consistency: monthly only, defined in `data-flows.md` §7.3.
9. Fixed category list with "Other" plus a custom label. Confirmed.
10. No email verification; approval gates access, with the email-verified badge. Confirmed.
11. Members who leave or are removed keep history; their tasks are hidden from active lists. Confirmed, with the metric rule in 4.2.

## 14. Changes from v2

- Added: welcome screen (username, requested role), join requests, team invitations, Admin read-only access and transfers, reset links, eligible roles, "When did you start?", day view, template weekly summary, local Postgres fallback, laptop-plus-tunnel friends test, two checkpoints.
- Changed: slice order (AI and Growth Tracker moved to Slices 4 and 5); Admin cannot edit academic records; files stored on local disk only; lateness never stored; current-timeframe and deletion rules for metrics.
- Removed: AI estimate call, Cloudinary from the MVP, the duplicated permission matrix and metric definitions (now only in their own documents).
