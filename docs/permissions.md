# CampusFlow AI: permission model

Version 0.4, 24 Oct 2026. Approved design, updated after the Opus review. `decisions.md` wins if anything here disagrees with it.

Related documents: `mvp-scope.md`, `data-model.md` (tables `roles`, `permissions`, `role_permissions`, `class_faculty`, `class_members`, `team_members`, `audit_logs`), `data-flows.md`.

## What changed since v0.3

- **Admin override narrowed:** Admin may *view* academic and team records, but its only writes outside the Admin module are **transfer class ownership** and **transfer team creator**. Admin no longer edits grades, assignments or rosters (section 5).
- **23 keys instead of 32**, merged where two keys always travelled together. Each key has **eligible roles**; the grid can only tick eligible cells (section 3).
- **Admin no longer holds student keys** (submitting, joining classes, personal tasks, AI).
- **Role changes are refused** while the user still has class or team relationships (section 6, rule 8).
- Pipeline step 2 now lets pending users reach `/welcome`; a user without a username is sent there first.
- Better Auth rules: `input: false` on app-owned fields, no cookie cache, no implicit account linking, sessions deleted on deactivation (section 6).
- Admin reset links and resetting a rejected account added (section 8).

---

## 1. Principles

1. **Every protected action is checked on the server.** Hiding a button is a convenience, never security.
2. **Two different questions, kept separate.**
   - *Permission* (admin-editable within limits): may this kind of user perform this kind of action at all? Admins assign existing keys to eligible roles; they cannot invent keys.
   - *Relationship* (fixed in code): is this user connected to **this specific record**, and in which capacity?
3. **Relationships are per record, not per person.** The same faculty member can be owner of class A and co-teacher of class B. The check reads the `class_faculty` row of that exact class.
4. **Privacy rules are not permissions.** No key exists for "view another user's personal tasks", "personal Growth Tracker" or "AI history", so no configuration can grant it, not even to Admin.
5. **Deny by default.**
6. **Permission changes take effect on the next request.** Permissions are read from the database per request, never stored in the session.

## 2. The check pipeline

Every action goes through these steps in order. The first failure stops it.

| # | Check | Question | Source |
|---|---|---|---|
| 1 | Signed in | Is there a valid session? | Better Auth session |
| 2 | Account status | Is `users.status` = active? A user **without a username** may only reach `/welcome` and sign-out. A pending user may reach `/welcome`, `/pending` and sign-out. Rejected and deactivated users see only `/pending` (their status message and a sign-out button) | `users` |
| 3 | Permission | Does the user's role hold the key? | `role_permissions` |
| 4 | Relationship | Is the user connected to this record in the needed capacity? Admin passes this step **for reading** the records in section 5, and for the two transfer actions | `class_faculty`, `class_members`, `tasks`, `team_members` |
| 5 | State | Does the record's state allow it (assignment open, code not expired, task not deleted, class not archived)? | The record |

Steps 1 to 3 do not need the record. Steps 4 and 5 do.

## 3. Permission keys, eligible roles and default grants

Keys are defined once in `src/server/auth/permission-keys.ts` with their module, description, **eligible roles** and **default roles**, and seeded into the database. The Admin grid shows every key against every role, but only eligible cells can be ticked; the server refuses any other grant. A **locked** key can never be removed from Admin.

Legend: **D** = granted by default. **e** = eligible, off by default. Blank = never possible.

### Admin module

| Key | Meaning | Student | Faculty | Admin | Locked |
|---|---|---|---|---|---|
| `admin.users.manage` | See the user list, approve or reject, deactivate or reactivate, create reset links, reset a rejected account | | | D | Yes |
| `admin.users.assign_role` | Set a user's role, including making another user an Admin | | | D | Yes |
| `admin.roles.edit_permissions` | Edit the grid (eligible cells only) | | | D | Yes |
| `admin.audit.view` | Read the audit log | | | D | |
| `admin.override` | View any class and team read-only; transfer class ownership; transfer team creator | | | D | Yes |

### Everyone

| Key | Meaning | Student | Faculty | Admin | Locked |
|---|---|---|---|---|---|
| `dashboard.view` | The dashboard; its content follows the role | D | D | D | |

### Classes

| Key | Meaning | Student | Faculty | Admin | Locked |
|---|---|---|---|---|---|
| `class.create` | Create a class (the creator becomes owner) | | D | | |
| `class.view` | See classes you belong to (Admin: all, through `admin.override`) | D | D | D | |
| `class.manage` | Edit or archive a class; add or remove co-teachers; transfer ownership (owner only, section 4) | | D | | |
| `class.members.manage` | Roster; join requests (approve, decline, reconsider); enrollment codes; remove students; decide leave requests; the `requires_approval` setting | | D | | |
| `class.join` | Send a join request with a code; ask to leave | D | | | |

### Assignments, submissions, grading

| Key | Meaning | Student | Faculty | Admin | Locked |
|---|---|---|---|---|---|
| `assignment.manage` | Post (all or selected), edit, add or remove recipients, change dates, close, cancel, grant resubmission | | D | | |
| `assignment.view` | See assignments addressed to you (Student) or in your classes (Faculty); Admin read-only | D | D | D | |
| `submission.create` | Submit and resubmit your own work | D | | | |
| `submission.view` | See submissions: own (Student), class (Faculty), any read-only (Admin) | D | D | D | |
| `submission.grade` | Give or edit marks and comments | | D | | |

### Tasks, teams, files

| Key | Meaning | Student | Faculty | Admin | Locked |
|---|---|---|---|---|---|
| `task.personal.manage` | Create and manage your own personal tasks and subtasks | D | e | | |
| `team.create` | Create a team | D | | | |
| `team.use` | See your teams and invitations; create, edit and assign tasks in teams you are an active member of | D | | D (view only) | |
| `file.upload` | Upload a file (what it may be attached to is decided by section 4) | D | D | | |

Downloading has **no key**; it is decided entirely by the parent record (section 4).

### Trackers and AI

| Key | Meaning | Student | Faculty | Admin | Locked |
|---|---|---|---|---|---|
| `tracker.personal.view` | Your own Growth Tracker | D | e | | |
| `tracker.class.view` | Class tracker (assigned versus submitted) | | D | D (view only) | |
| `ai.use` | AI breakdown on your own tasks and AI suggestions in your own weekly summary | D | e | | |

**Total: 23 keys, 4 locked.** Faculty are *eligible* for personal tasks, the personal tracker and AI, so the Admin can switch these on for Faculty later; the code paths are the same as for students.

Each page requires one key; the menu hides pages whose key is missing and the server checks again (route map in `folder-structure.md` §5).

## 4. Relationship rules, fixed in code

| Record | Who may read | Who may change | Admin | Notes |
|---|---|---|---|---|
| Personal task and its subtasks | Owner | Owner | **No** | Tier 1 |
| Assignment task (student's copy) | Assignee; class Faculty see status and submissions, **not subtasks** | Assignee changes status (not to done) and subtasks; cannot change the deadline, delete or reopen | Read status and submissions; **not subtasks** | Subtasks (including AI breakdowns) are tier 1 |
| Assignment | Class Faculty; **recipients** | Class Faculty | Read | Non-recipients cannot see it |
| Submission and its files | Submitter; class Faculty | Submitter creates versions; nobody edits an old version | Read (each file opening is audited) | Admin cannot submit |
| Grade | Graded student; class Faculty | Class Faculty | Read | |
| Class | Its Faculty; active student members (name, teachers, their own assignments) | Owner: everything; co-teacher: see below | Read; **transfer ownership** | Students never see other students or their submissions |
| Enrollment code, join requests, roster | Class Faculty | Class Faculty | Read | |
| Team and team tasks | Active members. An invited user sees only the invitation (team name, inviter) | Members: task content and assignment; **assignee only: status and deadline**; creator: membership | Read; **transfer creator** | |
| Assignment attachment files | Recipients; class Faculty | Uploader (faculty), within the attachment rules | Read | |
| Unattached file | Uploader only | Uploader | No | Cleaned up after 24 h |
| Personal Growth Tracker, AI suggestions | Owner | Owner | **No** | Tier 1 |
| Class tracker | Class Faculty | n/a | Read | |
| User list, audit log, role permissions | Admin | Admin | n/a | |

### Co-teacher powers, evaluated per class

- **Owner (of that class):** everything a class Faculty can do, plus adding or removing co-teachers, transferring ownership and archiving the class.
- **Co-teacher (of that class):** everything else (assignments, grading, codes, members, class tracker).
- The owner adds a co-teacher by **exact username or email of an active Faculty user**. Added and removed co-teachers are written to `audit_logs`.

## 5. Admin access (view and transfer)

**Purpose:** Admin can see what is happening anywhere, and can unblock a class or team whose owner is deactivated or gone, without being able to change academic results.

**Three privacy tiers:**

| Tier | Records | Who sees them |
|---|---|---|
| 1. Personal | Personal tasks and subtasks, subtasks of assignment tasks, personal Growth Tracker, AI suggestions | Owner only. Never Faculty, never Admin |
| 2. Academic | Classes, rosters, codes, assignments, assignment tasks (parent only), submissions and files, grades, class trackers | Class Faculty and the student concerned; **Admin read-only** |
| 3. Team | Teams and team tasks | Active members; **Admin read-only** |

**Rules:**
1. Through `admin.override`, Admin passes step 4 for **reading** tier 2 and tier 3 records, and for two writes only: **transfer class ownership** (to an active Faculty user, who becomes owner; the old owner becomes co-teacher unless deactivated) and **transfer team creator** (to an active member).
2. Admin never passes step 4 for any other write: not grading, not editing assignments, not submitting, not changing rosters or team tasks.
3. Both transfers and every opening of a submission file by Admin are written to `audit_logs` with `details.via = "admin"`.
4. Pages Admin opens through this access show a banner, "Viewing as admin".
5. Admin does not appear in rosters or member lists.
6. The sign-up and welcome pages say: "Administrators can view class records (assignments, submissions and grades). Your personal tasks and Growth Tracker are private to you."

## 6. Locked rules (cannot be changed from the Admin page)

1. The three roles are fixed: they cannot be created, renamed or deleted.
2. Locked keys stay with Admin. Keys can only be granted to eligible roles. Making another user an Admin is allowed (`admin.users.assign_role`) and audited.
3. The last active admin cannot be deactivated or have their role changed.
4. Nobody can approve themselves, change their own role or deactivate themselves.
5. The requested role at sign-up is a hint only. Admin is never offered at sign-up. Approval needs a chosen role. The first Admin comes only from `npm run admin:promote`; no runtime code promotes anyone by email.
6. No key exists for tier 1 data of another user.
7. Every change to roles, permissions, account status, reset links and transfers is written to `audit_logs` in the same transaction. `audit_logs` and `task_events` reject UPDATE and DELETE (database trigger).
8. **A role change is refused** while the user is owner or co-teacher of a non-archived class, or an active, requested or leave-requested member of a class, or an active or invited member of a team. The Admin page lists what blocks the change.
9. **Deactivation** sets `status = deactivated` and deletes the user's rows in Better Auth's `session` table in the same transaction (the one place our code writes a Better Auth table). Step 2 reads the status on every request, so access ends at once in any case.
10. **Better Auth settings:** every app-owned `user` field is an `additionalField` with `input: false`; `session.cookieCache` is off; `accountLinking.disableImplicitLinking` is true; the username plugin's `is-username-available` endpoint is disabled and `immutableUsername` is on. **[Verify]** the exact option names against the current Better Auth docs in Slice 1.

## 7. Where the checks live

1. **Data access functions (the real enforcement).** Every read and write takes the acting user and scopes the query ("tasks where assignee = this user"), never "task by id". A record the user cannot access is not found. The Admin read access is implemented once here.
2. **Policy functions**, one small function per rule, for example `canGradeSubmission(user, submission)`, in each domain's `policy.ts`. Plain functions, testable without a browser. Shared helpers (`authorize`, class capacity, Admin access) live in `src/server/policies/`.
3. **`proxy.ts` (coarse only).** Redirects visitors with no session cookie to `/sign-in`. It cannot read the database, so it cannot know a username or an account status; that routing is `gate()` in `src/server/auth/access-gate.ts`, which every page calls (decided in Slice 1). Never the only check. Its matcher excludes `/api/auth`, `/api/uploads`, `/api/files` and static files.
4. **The UI.** Hides buttons and menu items based on the permission set. Convenience only.

Checks run in every page's data function and every action; a check only in a layout is not enough (layouts do not run for server actions, and are not re-run on every client navigation).

The permission set is loaded once per request and passed to the policy functions.

## 8. The Admin page

- **Users:** list with a status filter. Pending accounts show the **requested role** and whether the **email is verified**; for an unverified email the approve button asks "Have you confirmed this person owns this email?". Approve (role pre-filled, required) or reject. Change a role (refused with reasons under rule 8). Deactivate or reactivate. **Create a reset link** (one-time, expires after 1 hour, shown once to the Admin). **Reset a rejected account** to pending.
- **Roles and permissions:** keys (rows, grouped by module) by roles (columns). Ineligible cells are not shown as checkboxes; locked cells are disabled. Each key has a plain-language description. "Restore defaults" resets a role to its default grants.
- **Classes and teams:** lists of all classes and teams; opening one shows the normal page read-only with the banner. Actions: transfer class ownership, transfer team creator.
- **Audit log:** read-only, filterable by actor, action and `via = admin`.

## 9. Tests

A table-driven suite written with the permission code. Each case: acting user type, action, record relationship, expected result.

Acting user types: signed out, no username yet, pending, rejected, deactivated, student non-member, student requested, student member (not recipient), student recipient, other student, team invitee, team member, team creator, faculty owner, faculty co-teacher, faculty of another class, admin.

Required cases (each item in sections 4, 5 and 6 becomes at least one test):
- Pending user opens the dashboard: denied. Pending user opens `/welcome`: allowed.
- A user calls Better Auth `update-user` with `status: "active"` or a `roleId`: nothing changes.
- Student reads another student's submission: denied.
- Student not selected as a recipient opens the assignment: denied.
- Faculty owner of class A and co-teacher of class B: archiving A allowed, archiving B denied; adding a co-teacher to A allowed, to B denied.
- Co-teacher grades in their class: allowed.
- Admin removes `submission.grade` from Faculty: Faculty cannot grade on the next request.
- Admin grants `class.create` to Student (ineligible): refused.
- Admin removes a locked key from Admin: refused.
- Admin makes another user an Admin: allowed and audited.
- Last admin deactivates themselves: refused.
- Admin changes the role of a faculty member who owns a class: refused, with the class listed.
- **Admin edits a grade in any class: denied.** Admin reads that grade: allowed.
- Admin transfers class ownership: allowed and audited. Admin submits for a student: denied.
- Admin reads a student's personal task, or the subtasks of an assignment task: denied.
- Admin opens a submission file: allowed and audited.
- Teammate changes the status of a task assigned to someone else: denied; reassigning it: allowed.
- Downloading a submission file by direct URL while not authorised: not found.
- A deactivated user's existing session makes a request: denied.
