# CampusFlow AI: MVP Scope v2 (build brief)

Version 2, 21 Oct 2026. Replaces v1. Written at the end of Phase 1 (requirements).
Items marked **[Confirm]** are interpretations Claude made from short answers. The owner should confirm or correct them (see section 13).

---

## 0. How to use this document (read this first, Claude)

Paste this whole file at the start of a build session. The owner is a solo final-year CS student. Working agreements:

1. **The owner wants to understand the system**, not receive a pile of generated code. Explain each design decision and its trade-offs before writing code, and keep explanations short.
2. **Work in small vertical slices** (section 11). Do not start the next slice before the current one meets its "done" criteria.
3. **Claude writes most of the code; the owner reviews, runs and tests it.** Give code in reviewable pieces with a short note on what it does. For auth, permissions and file uploads, point out exactly which lines the owner must read carefully.
4. **No code until the Phase 2 outputs are approved:** ER diagram, draft Drizzle schema, permission matrix, folder structure.
5. **Verify current documentation** for Next.js, Better Auth, Drizzle, Neon and Ollama before using their APIs. Versions change; do not rely on memory.
6. **All permission checks happen on the server.** Hiding a button is never security.
7. **Keep a decision log** in `docs/decisions.md`: one line per decision with the reason.
8. **Do not add features outside this scope.** Put ideas in section 10 instead.
9. **Be honest about uncertainty.** Say when something is an estimate, a guess, or unverified.
10. The owner uses **Windows and PowerShell**. Give commands that work there.

---

## 1. Goal

One platform where students and faculty manage academic work and personal tasks together. An AI assistant makes large tasks less intimidating by breaking them into smaller steps, and a Growth Tracker shows how a student's productivity changes over time, using numbers computed from real data (the AI only explains them).

Evaluation: working demo, report, viva, novelty. Demo is after Jan/Feb 2027 (exact date unknown). Solo project.

## 2. Environment and stack

| Item | Choice |
|---|---|
| Framework | Next.js with TypeScript |
| Database | PostgreSQL on Neon |
| ORM | Drizzle ORM |
| Auth | Better Auth (email/password and Google) |
| UI | Tailwind CSS and shadcn/ui |
| AI | Llama 3.2 3B through Ollama on the owner's laptop |
| File storage | Storage layer with local disk first; Cloudinary evaluated before the upload slice |
| Repo | `C:\dev\campusflow` (outside OneDrive) |

Laptop: ASUS TUF F15, Core i5-11400H, 16 GB RAM, 4 GB GPU. Measured with `llama3.2:3b` in Ollama: about 39 tokens per second, about 4.4 s for an 8-subtask answer, 80% GPU / 20% CPU, context 4096. Keep AI prompts short.

## 3. Roles and account lifecycle

Roles: **Admin, Faculty, Student.** Three fixed roles. What each role may do is stored as role-to-permission rows in the database and edited from the Admin page. Per-user custom permissions are post-MVP.

**Account lifecycle**
1. A person signs up with Google or with email and password (passwords hashed by the auth library; never hand-roll password handling).
2. The new account is **Pending**. It cannot use the app. It sees a "waiting for approval" screen.
3. An admin approves the account and assigns the role (Student or Faculty), or rejects it. Admins can also deactivate accounts later.
4. The very first admin is created by a seed script that reads an admin email from an environment variable, so the system can be bootstrapped.
5. No separate email verification in the MVP; admin approval gates access. **[Confirm]**

**Admin page:** user list and approvals, role assignment, role-to-permission editor, simple audit log (who changed which role or permission, and when). The last remaining admin cannot demote or deactivate themselves.

**Admin visibility:** admins see users, roles, permissions, class metadata (names, faculty, member counts) and the audit log. Admins do **not** see personal tasks or personal Growth Trackers. Whether admins can open submission files is not decided; default is no. **[Confirm]**

## 4. Functional scope (in)

### 4.1 Personal tasks (students)
- Fields: title, description, deadline (optional), priority, status, estimate (optional), category, "planned" is derived (see 5.6).
- Statuses: To do, In progress, Done. "Overdue" is calculated, not a status.
- Subtasks: one level only (a subtask cannot have subtasks).
- Categories: fixed list (Assignment, Study, Project, Reading, Other). **[Confirm]**
- Faculty cannot see a student's personal tasks in the MVP.
- Personal tasks and teams are for students in the MVP. **[Confirm]**

### 4.2 Classes
- Faculty create classes. A student can be in many classes. A class has an owner faculty and may have additional faculty (co-teachers). **[Confirm]**
- **Enrollment code:** random, 8 characters from an alphabet without look-alike characters. Each code has an `expires_at` (faculty choose 1, 7 or 30 days; default 7). The join check compares `expires_at` with the current time, so no external service or scheduler is needed. Faculty can deactivate a code or generate a new one at any time. Expiry does not remove existing members.
- Faculty can remove a student from a class. A student who wants to leave **sends a leave request** that the class faculty approves or denies.
- When a member leaves or is removed, their assignment tasks stay for history and metrics but are hidden from active lists. **[Confirm]**

### 4.3 Assignments, submissions and grading
- Faculty post an assignment to **all enrolled students or to selected students** (chosen from the class list). Each recipient gets their own task. Students who join later do not receive earlier assignments automatically; faculty can add them as selected recipients. **[Confirm]**
- Assignment fields: title, description, due date, optional close date, maximum marks, attachments.
- Faculty can attach files to an assignment. No fixed count requested; the app enforces a safety cap of 20 files per assignment or submission (configurable). **[Confirm]**
- Students submit text, a link, and/or files. Late submissions are allowed and flagged as late.
- **Resubmission** is allowed until the assignment is closed. Every submission version is kept; the latest version is graded; the **first** submission time decides on-time.
- Faculty grade a submitted task: numeric marks out of the maximum, plus a short comment. Students see both. Faculty can edit a grade.
- Faculty see submission status per student: not submitted, submitted, late, graded.

### 4.4 Files
- Allowed types in the MVP: **PDF, JPG, PNG.** CSV for bulk import comes later.
- Size limit per file is set by the storage mode. Default 10 MB so switching storage later does not break existing rules (Cloudinary's free plan allows 10 MB per raw file and per image).
- Validate type by file content as well as extension. Store files under random IDs, never user-supplied names.
- **Every file download goes through a server route that checks permissions.** The storage layer only holds bytes.
- Storage layer interface: `upload`, `getAccessUrl`, `delete`. Start with local disk. Before building uploads, spend about 30 minutes testing Cloudinary private/authenticated delivery (unsigned links refused, time-limited signed links work). If it passes, add a Cloudinary implementation behind the same interface. Note that Cloudinary needs internet during the demo; local disk does not.

### 4.5 Teams
- Teams are independent of classes. A team may include students from different classes. Class assignments stay individual and come from each student's own teachers.
- The creator manages members (add, remove). Any member can create tasks in the team and assign them to any member.
- Team tasks use the same task structure as personal tasks, with an owner and a team context.
- Team progress = done tasks ÷ total tasks.

### 4.6 Dashboards
- **Student:** upcoming deadlines (personal, academic, team), overdue tasks, pending submissions, completion rate, on-time rate, average active time.
- **Faculty:** per-class overview of assigned versus submitted, late, graded.
- **Admin:** pending approvals, user counts by role.

### 4.7 AI (students only; see section 8) and Growth Tracker (see section 9)

---

## 5. Business rules and metric definitions (canonical)

1. **Statuses:** To do, In progress, Done. Priority: Low, Medium, High.
2. **Timestamps on every task:** `created_at`, `started_at` (set the first time the task enters In progress; never overwritten), `completed_at`, `deadline`. All stored in UTC. Display uses the user's timezone, default Asia/Kolkata. Week = Monday to Sunday in the user's timezone.
3. **Active time** = `completed_at − started_at`. If a task goes straight from To do to Done, there is no start recorded: it is excluded from active-time averages and flagged "no start recorded".
4. **Overall time** = `completed_at − created_at`, stored and shown separately.
5. **On-time:** completed on or before the deadline. Tasks without a deadline are excluded from the on-time rate (never counted as on-time or late).
6. **Planned (for a week):** any task whose deadline falls inside that week. A separate "planned" flag is not used.
7. **Completion rate** = tasks Done ÷ tasks whose deadline fell in the period. Tasks without a deadline are excluded.
8. **Parent task:** cannot be marked Done while any subtask is not Done. The user can choose "complete all subtasks and this task" explicitly.
9. **Estimates:** each task can have an optional estimate (in minutes). **Estimate accuracy** = actual active time ÷ estimate.
   - **Suggested estimate** (computed in code, not by the AI): when a task is created with a category, show the median active time of the user's last completed tasks in that category, if there are at least 3. Otherwise show the AI's rough estimate from the breakdown, labelled "AI guess". **[Confirm]** (The 3B model is unreliable at numbers, so history-based estimates are calculated in SQL; the AI is not asked to compute them.)
10. **Assignments** produce one task per recipient. Submitting completes that task (first submission sets `completed_at`).
11. **Late:** submitted after the deadline. Flagged, still accepted. Resubmission until the assignment is closed. Workflow-based locking (blocking resubmission after someone else moves the task in a workflow) is later.
12. **Consistency (Growth Tracker):** share of weeks in the period where the student's weekly completion rate was at least 70% (threshold configurable). **[Confirm]**

---

## 6. Permission matrix (draft for Phase 2)

Permissions are named keys in code; the role mapping lives in the database. Ownership rules are in code and are not admin-editable (for example "a student can read only their own submissions").

| Action | Pending | Student | Faculty | Admin |
|---|---|---|---|---|
| Use the application | No | Yes | Yes | Yes |
| Approve users, assign roles | No | No | No | Yes |
| Edit role permissions, view audit log | No | No | No | Yes |
| Create and manage own personal tasks | No | Yes | No | No |
| Create class | No | No | Yes | No |
| Generate or deactivate enrollment code | No | No | Class faculty | No |
| Join class by code | No | Yes | No | No |
| Request to leave class | No | Yes | No | No |
| Approve leave, remove student | No | No | Class faculty | No |
| Post assignment (all or selected), attach files | No | No | Class faculty | No |
| Submit and resubmit | No | Recipient only | No | No |
| Grade submission | No | No | Class faculty | No |
| View class tracker | No | No | Class faculty | No |
| Create team, manage members | No | Yes (creator) | No | No |
| Create and assign team tasks | No | Team members | No | No |
| Use AI breakdown | No | Yes | No | No |
| View another user's personal tasks or Growth Tracker | No | No | No | No |

---

## 7. User stories

**Everyone:** I can sign up with Google or email and password, see that my account is waiting for approval, and sign in once approved.

**Admin:** I can approve or reject new accounts and pick their role. I can change roles. I can edit which permissions each role has. I can see an audit log of those changes. I can see user and class counts without seeing anyone's personal tasks.

**Faculty:** I can create a class and generate an enrollment code with an expiry. I can add co-teachers. I can post an assignment to all or selected students, with files. I can see who submitted, who is late, and who is missing. I can grade a submission with marks and a comment. I can approve leave requests and remove students. I can see my class tracker (assigned versus submitted).

**Student:** I can create tasks with deadlines, priorities and subtasks, and mark them in progress and done. I can join classes with a code and receive assigned work. I can submit text, links and files, resubmit until closed, and see my grade and comment. I can ask for a leave from a class. I can create a team, add members and assign team tasks. I can press "break this down" to get subtask suggestions that I can edit before saving. I can see my dashboard and my Growth Tracker with weekly and monthly trends and a plain-language summary.

---

## 8. AI feature spec (students only)

- **Model:** `llama3.2:3b` via Ollama, behind a thin interface so the model can be swapped.
- **Breakdown button** on any task or assigned task. Input: title, description, deadline, today's date. Output forced to a JSON schema through Ollama structured output: `{subtasks: [{title, estimated_minutes, order}]}`, 3 to 10 items.
- **Validate in code** (schema, lengths, count). Retry once on failure. If it still fails, show "AI unavailable, add subtasks manually".
- **The user edits and accepts** suggestions before anything is saved.
- **Code, not the AI, assigns dates** (spread between today and the deadline). The AI never does date arithmetic.
- One AI request at a time (queue), 60 s timeout, visible loading state. English only. Keep prompts short (context 4096).
- **Weekly summary:** the AI receives a JSON of computed metrics and writes plain language. After generation, code checks that every number in the text appears in the input; otherwise the summary is rejected and a plain metric list is shown.
- Log each suggestion and whether the student accepted, edited or discarded it (for the report's evaluation). Build an evaluation set of 20 to 30 sample assignments with a simple scoring rubric.
- Prioritization, conflict and overload detection, and project planning by AI are later.

## 9. Growth Tracker spec

- **Student view:** weekly and monthly. Metrics: completion rate, on-time rate, average active time, estimate accuracy by category, consistency (5.12), each compared with the previous period.
- A trend is shown only when the period has at least **10 completed tasks**; otherwise "not enough data yet".
- All numbers come from SQL on real data. The AI only writes the explanation (section 8 checks).
- **Class tracker (faculty):** per class and assignment: assigned, submitted, late, graded, submission rate. No personal tasks and no personal trackers.
- **Seed data:** a script generates a few months of simulated activity for demo users. Seeded rows carry an `is_seed` flag, and the UI shows a visible "Simulated data" banner. The report states which data is simulated.

---

## 10. Out of scope for now (later list)

Communication (announcements, messaging, discussions), shared notes, notifications through third-party services, CSV bulk import, workflow-based resubmission locking, faculty viewing students' personal tasks (opt-in and permission-based), per-user custom permissions, team assignments, project milestones, AI prioritization and conflict detection, calendar sync, real-time collaboration, public deployment, faculty-side AI.

---

## 11. Build order (vertical slices)

Phase 2 comes first: architecture, ER diagram, Drizzle schema draft, permission matrix, folder structure, wireframes. No feature code before the owner approves them.

A slice is **done** only when: schema and logic exist, permission tests pass (for example a student cannot read another student's submission), the owner can explain it, and `docs/decisions.md` is updated.

| # | Slice | Exit check |
|---|---|---|
| 0 | Project setup (Next.js, Drizzle, Neon, env, lint, seed skeleton) | App runs, migration applies |
| 1 | Auth: email, Google, Pending state, admin approval, first-admin seed | Pending user is blocked until approved |
| 2 | Permissions and Admin page, audit log | Role permission change takes effect server-side |
| 3 | Personal tasks, subtasks, statuses, timestamps | Timestamp rules in section 5 verified |
| 4 | Classes, enrollment codes with expiry, join, leave request, removal | Expired code is refused |
| 5 | Assignments (all or selected), attachments, per-student tasks | Selected students only receive it |
| 6 | Submissions, resubmission, grading, storage layer | Unauthorized file access refused |
| 7 | Teams and team tasks | Any member can assign; only creator manages members |
| 8 | Dashboards and metrics SQL | Metrics match hand-calculated examples |
| 9 | Growth Tracker, class tracker, seed data | Hand-checked numbers; "not enough data" state works |
| 10 | AI: breakdown, estimate hint, weekly summary | Invalid output never reaches the database |
| 11 | Hardening: security review, tests, demo setup, documentation | Full demo run from the laptop |

## 12. Effort estimate (Claude's estimate, not a measurement)

| Addition since v1 | Extra hours (approx.) |
|---|---|
| Google login and approval flow | 10 to 15 |
| Selected-student assignments | 10 to 15 |
| Co-teachers, leave approval, code expiry | 10 to 15 |
| Grading and feedback | 8 to 12 |
| Class tracker for faculty | 10 to 15 |
| History-based estimate suggestions | 8 to 12 |

v1 was about 250 to 380 focused hours with Claude writing most code. v2 is roughly **310 to 470 hours**, about **17 to 26 weeks at roughly 18 realized hours per week**. If the demo falls in early 2027, the **cut list, in order**: (1) Google login, (2) leave-request approval flow (use direct removal only), (3) co-teachers, (4) history-based estimate suggestions, (5) monthly view of the Growth Tracker.

## 13. Items needing confirmation

1. "Different faculties" is read as: a class has one owner plus optional co-teachers (students can also be in many classes).
2. Personal tasks and teams are student-only in the MVP.
3. Admins cannot open submission files.
4. 20-file safety cap per assignment or submission despite "no limit".
5. Enrollment code expiry: default 7 days, stored as `expires_at`, no external API or scheduler.
6. Estimate suggestions are computed from history (median by category, at least 3 tasks); the AI does not compute numbers.
7. Students joining later do not receive earlier assignments automatically.
8. Consistency metric definition (5.12).
9. Fixed category list.
10. No email verification; admin approval gates access.
11. Leaving or removed members keep history but see assignment tasks hidden.

## 14. Changes from v1

- Added: Google login, account approval, enrollment code expiry, leave requests, multi-faculty classes, selected-student assignments (moved from stretch into the MVP), grading, class tracker, history-based estimates, per-file rules, permission matrix, build slices.
- Changed: admins no longer see personal tasks; uploads limited to PDF, JPG, PNG; planned-versus-completed uses "due that week".
- Postponed: CSV import, workflow locking, faculty view of student tasks.
