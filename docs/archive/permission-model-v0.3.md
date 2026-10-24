# CampusFlow AI: permission model draft (v0.3)

Phase 2, step 2. A design draft, **not** code. Not final until the owner approves it. Items marked **[Confirm]** are choices Claude made that the owner should check.

Related documents: `mvp-scope.md`, `data-model-draft.md` (tables `roles`, `permissions`, `role_permissions`, `class_faculty`, `class_members`, `team_members`).

## What changed since v0.1

- **Admin override added** (section 5): Admin can view and act on academic and team records anywhere, so deadlocks can be resolved. Every override action is logged.
- **Admin default grants:** Admin now holds all 32 permission keys by default (section 3).
- **Admin can view submissions and grades** (reverses the v0.1 default). Personal data stays private from everyone, including Admin.
- **Ownership is per class**, not per person: the same faculty can be owner in one class and co-teacher in another (section 4, test cases added).
- **Making someone an Admin is allowed** and is not blocked by the locked keys (section 6, rule 2).
- Two small new Admin actions: **transfer class ownership** and **transfer team creator**.
- Owner confirmations recorded: co-teacher powers, locked keys, roster privacy, private subtasks.

---

## 1. Principles

1. **Every protected action is checked on the server.** Hiding a button is a convenience, never security.
2. **Two different questions, kept separate.**
   - *Permission* (admin-editable): is this kind of user allowed to perform this kind of action at all? Example: may a Faculty create a class? Admins can change this from the Admin page, but only by assigning existing keys. They cannot invent new ones.
   - *Relationship* (fixed in code): is this user connected to **this specific record**, and in which capacity? Example: is this Faculty the owner, or a co-teacher, of *this* class?
3. **Relationships are per record, not per person.** The same faculty can be the owner of class A and a co-teacher of class B. In class A they may archive the class and manage co-teachers; in class B they may not. The check always reads the `class_faculty` row for that exact class.
4. **Privacy rules are not permissions.** There is no permission key for "view another user's personal tasks", "personal Growth Tracker" or "AI history", so no configuration can grant it, not even to Admin.
5. **Deny by default.** If no rule allows an action, it is refused.
6. **Permission changes take effect on the next request.** Permissions are read from the database per request, never baked into a login token.

## 2. The check pipeline

Every action goes through these steps in order. The first failure stops the action.

| # | Check | Question | Where the answer comes from |
|---|---|---|---|
| 1 | Signed in | Is there a valid session? | Better Auth session |
| 2 | Account status | Is `users.status` = active? Pending, rejected and deactivated users are refused everywhere except sign-out and the "waiting for approval" page | `users.status` |
| 3 | Permission | Does the user's role have the permission key for this action? | `role_permissions` |
| 4 | Relationship | Is the user connected to this specific record in the needed capacity (class owner, co-teacher, assignee, active team member)? **Admin passes this step for the records listed in section 5.** | `class_faculty`, `class_members`, `tasks`, `team_members` |
| 5 | State | Does the record's current state allow it (assignment open, code not expired, task not deleted)? | The record itself |

Steps 1 to 3 do not need the record. Steps 4 and 5 do.

## 3. Permission keys and default grants

Seeded from code. Admins assign existing keys to roles; they cannot create new keys. A key marked **locked** cannot be removed from Admin and cannot be granted to Student or Faculty.

Legend: S = Student, F = Faculty, A = Admin. **Admin holds all 32 keys by default.** A key is only the first half of an action: for personal data and for actions like submitting, the relationship rules in section 4 still apply, so holding a student key does not let Admin see anyone's personal data.

### Admin module

| Key | Meaning | S | F | A | Locked |
|---|---|---|---|---|---|
| admin.dashboard.view | See the admin overview (pending approvals, user counts) | | | Yes | |
| admin.users.view | See the user list | | | Yes | |
| admin.users.approve | Approve or reject new accounts | | | Yes | Yes |
| admin.users.assign_role | Set a user's role, including making another user an Admin | | | Yes | Yes |
| admin.users.deactivate | Deactivate or reactivate accounts | | | Yes | |
| admin.roles.edit_permissions | Edit which keys each role has (existing keys only) | | | Yes | Yes |
| admin.audit.view | Read the audit log | | | Yes | |

### Classes

| Key | Meaning | S | F | A | Locked |
|---|---|---|---|---|---|
| class.create | Create a class | | Yes | Yes | |
| class.view | See classes you belong to (Admin: all classes) | Yes | Yes | Yes | |
| class.manage | Edit or archive a class; add or remove co-teachers (class owner only, see section 4) | | Yes | Yes | |
| class.code.manage | Generate, deactivate or extend enrollment codes | | Yes | Yes | |
| class.members.manage | View the roster, approve or decline join requests, remove students, decide leave requests | | Yes | Yes | |
| class.join | Send a join request with a code (the teacher decides) | Yes | | Yes | |
| class.leave.request | Ask to leave a class | Yes | | Yes | |

### Assignments, submissions, grading

| Key | Meaning | S | F | A | Locked |
|---|---|---|---|---|---|
| assignment.post | Create an assignment (all or selected students, attachments) | | Yes | Yes | |
| assignment.manage | Edit, change the due date, close, grant resubmission | | Yes | Yes | |
| assignment.view | See assignments addressed to you (Student) or in your classes (Faculty, Admin: all) | Yes | Yes | Yes | |
| submission.create | Submit and resubmit your own work | Yes | | Yes | |
| submission.view | See submissions (own for Student; class for Faculty; all for Admin) | Yes | Yes | Yes | |
| submission.grade | Give or edit marks and comments | | Yes | Yes | |

### Tasks, teams, files

| Key | Meaning | S | F | A | Locked |
|---|---|---|---|---|---|
| task.personal.manage | Create and manage your own personal tasks and subtasks | Yes | | Yes | |
| task.team.manage | Create, edit and assign tasks in teams you are an active member of | Yes | | Yes | |
| team.create | Create a team | Yes | | Yes | |
| team.view | See teams you are an active member of, and your invitations (Admin: all teams) | Yes | | Yes | |
| team.members.manage | Invite or remove members (team creator only; Admin by override) | Yes | | Yes | |
| file.upload | Upload a file (what it may be attached to is decided by section 4) | Yes | Yes | Yes | |

Downloading a file has **no permission key**: it is decided entirely by the relationship rules in section 4.

### Dashboards, trackers, AI

| Key | Meaning | S | F | A | Locked |
|---|---|---|---|---|---|
| dashboard.student.view | Student dashboard (your own data) | Yes | | Yes | |
| dashboard.faculty.view | Faculty class overview | | Yes | Yes | |
| tracker.personal.view | Your own Growth Tracker | Yes | | Yes | |
| tracker.class.view | Class tracker (assigned versus submitted) | | Yes | Yes | |
| ai.breakdown.use | Use the AI task breakdown on your own tasks | Yes | | Yes | |
| ai.summary.use | Generate your own weekly AI summary | Yes | | Yes | |

Total: 32 keys. Each page in the app requires one key; the menu hides pages whose key the user lacks, and the server checks again.

## 4. Relationship rules, fixed in code

| Record | Who may read | Who may change | Admin override | Notes |
|---|---|---|---|---|
| Personal task and its subtasks | The owner only | The owner only | **No** | Private from Faculty and Admin |
| Assignment task (the student's copy) | The assignee; class Faculty see its status and submission, not its subtasks | The assignee changes status and subtasks; the student cannot change the deadline, delete or reopen it | Read status and submission; **not the student's subtasks** | Subtasks a student adds (including AI breakdowns) are private to the student. Faculty and Admin see only the parent task |
| Assignment | Faculty of the class; students who are **recipients** | Faculty of the class | Read and change | A student not selected as a recipient cannot see it |
| Submission | The submitter and the class Faculty | The submitter creates versions; nobody edits an old version | **Read** | Admin cannot submit for a student |
| Grade | The graded student and the class Faculty | Class Faculty | Read and edit (logged) | |
| Class | Its Faculty; its active student members (limited view: name, teachers, their own assignments) | Owner: everything; co-teacher: see below | Everything an owner can do | Students never see other students or other students' submissions |
| Enrollment code | Class Faculty | Class Faculty | Yes | |
| Team and team tasks | Active members only. An invited user sees only the invitation (team name, inviter) | Active members for tasks; the creator for membership | View, remove members, **transfer creator** | |
| File | Via its parent: assignment attachments go to recipients and class Faculty; submission files go to the submitter and class Faculty | The uploader, within the file rules in the scope document | Read via the parent record | Always served through a server route that runs these checks |
| Personal Growth Tracker, AI suggestions | The owner only | The owner | **No** | |
| Class tracker | Class Faculty (owner and co-teachers) | n/a | Read | Aggregated assigned versus submitted data |
| User list, audit log, role permissions | Admin | Admin | n/a | |

### Co-teacher powers (confirmed), evaluated per class

- **Class owner (for that class):** everything a class Faculty can do, plus adding or removing co-teachers, transferring ownership, and archiving the class.
- **Co-teacher (for that class):** everything else (post and manage assignments, grade, manage codes and members, see the class tracker).
- A faculty member can hold a different capacity in each class. Capacity is read from the `class_faculty` row of the class being accessed.

## 5. Admin override (deadlock resolution)

**Purpose:** if a class owner is deactivated or unreachable, a team creator leaves, or a grade or assignment needs urgent correction, Admin can act without asking anyone to hand over access.

**What it is:** in step 4 of the pipeline, Admin counts as having the needed relationship for classes, assignments, submissions, grades, enrollment codes, class trackers and teams. The permission key (step 3) and the state rules (step 5) still apply.

**Three privacy tiers:**

| Tier | Records | Who sees them |
|---|---|---|
| 1. Personal | Personal tasks and subtasks, subtasks of assignment tasks, personal Growth Tracker, AI suggestions | The owner only. Never Faculty, never Admin |
| 2. Academic | Classes, rosters, assignments, assignment tasks (parent only), submissions and files, grades, class trackers | Class Faculty and the student concerned; **Admin by override** |
| 3. Team | Teams and team tasks | Active members; Admin for membership management and viewing |

**Rules for override:**
1. Every write made through the override is recorded in `audit_logs` with an `override` flag (inside `details`) so it can be told apart from normal activity.
2. The UI shows a visible banner, "Acting as admin", on class and team pages Admin does not belong to.
3. Two new Admin actions exist: **transfer class ownership** and **transfer team creator**.
4. Admin does not appear in a class roster or team member list because of an override; the override changes who may act, not who is a member.
5. The app should say on the sign-up page that administrators can view academic records. **[Confirm]**

**Effort (Claude's estimate):** about 8 to 12 hours in total (one branch in the policy functions, two transfer actions, the audit flag, the Admin class and team list pages, and the extra tests).

## 6. Locked rules (cannot be changed from the Admin page)

1. The three roles are fixed. They cannot be created, renamed or deleted.
2. The three keys marked locked stay with Admin and cannot be granted to Student or Faculty. **This does not stop Admin from making another user an Admin:** that is the `admin.users.assign_role` action on a user, not a change to the permission grid. It is allowed, and it is written to the audit log. Other keys can be freely granted or removed.
3. The last active admin cannot be deactivated or have their role changed.
4. Nobody can approve themselves, change their own role, or deactivate themselves.
4a. The role a person requests at sign-up is a hint only. Admin is never offered at sign-up; a new Admin is made by an existing Admin choosing that role at approval or later (or by editing the database in an emergency). Approval is impossible without a role being chosen.
5. No key exists for reading another user's personal tasks, personal tracker or AI history (tier 1).
6. Every change to roles, permissions or account status is written to `audit_logs` in the same database transaction as the change.
7. Deactivating a user ends their active sessions (verify how Better Auth supports this).

## 7. Where the checks live

Four layers, strongest first:

1. **Data access functions (the real enforcement).** Every function that reads or writes data takes the acting user and scopes the query: for example "tasks where assignee = this user", never "task by id". A record the user cannot access is simply not found. The Admin override is implemented here, once, not repeated in every screen.
2. **Policy functions.** One small function per rule, for example `canGradeSubmission(user, submission)`. Server actions and route handlers call them. They are plain functions, so they can be tested without a browser.
3. **Next.js middleware (coarse only).** Redirects visitors who are signed out or pending. It must never be the only check; verify the current Next.js behavior and known bypass issues when we build it.
4. **The UI.** Hides buttons and menu items based on the user's permission set. A convenience only.

The user's permission set is loaded once per request (not stored in the session token) and passed to the policy functions.

Provisional folders (to be settled in step 3): `src/server/auth/` for session and permission loading, `src/server/policies/` for the policy functions, `src/server/data/` for scoped data access.

## 8. The Admin page

- **Users:** list with status filter; pending accounts show the **requested role** (Student, Faculty or blank) as a suggestion; approve or reject and choose the role (pre-filled with the request, always changeable, required before approving); change a role (including to Admin); deactivate or reactivate.
- **Roles and permissions:** a grid of permission keys (rows, grouped by module) by roles (columns) with checkboxes. Locked cells are shown disabled. Each key has a plain-language description. A "restore defaults" button resets a role to the seeded grants.
- **Classes and teams:** lists of all classes and teams, opening the normal class or team page with the "Acting as admin" banner. Actions: transfer class ownership, transfer team creator.
- **Audit log:** read-only, filterable by actor, action and override flag.

## 9. How this will be tested

A table-driven test suite, written together with the permission code, not after it. Each case is: acting user type, action, record relationship, expected result (allow or deny).

Acting user types: signed out, pending, student non-member, student member (not recipient), student recipient, other student, faculty owner, faculty co-teacher, faculty of another class, admin.

Example cases:
- Pending user opens the dashboard: denied.
- Student reads another student's submission: denied.
- Student not selected as a recipient opens the assignment: denied.
- **Faculty is owner of class A and co-teacher of class B:** archiving A is allowed, archiving B is denied, adding a co-teacher to A is allowed, adding one to B is denied.
- Co-teacher grades a submission in their class: allowed.
- Admin removes `submission.grade` from Faculty: Faculty cannot grade on the next request.
- Admin removes a locked key from the Admin role: refused.
- Admin makes another user an Admin: allowed and logged.
- Last admin deactivates themselves: refused.
- Admin edits a grade in a class they do not teach: allowed, logged with the override flag.
- Admin reads a student's personal task: denied.
- Admin reads the subtasks of a student's assignment task: denied.
- Downloading a submission file by direct URL while not authorized: denied.

Every item in sections 4, 5 and 6 becomes at least one test.

## 10. Open decisions

1. Admin holds all 32 keys by default (rather than only the faculty-type keys). **[Confirm]**
2. The three privacy tiers in section 5, in particular that Admin reads submissions but never personal data. **[Confirm]**
3. Teams are included in the Admin override (view, remove members, transfer creator). **[Confirm]**
4. The privacy notice on the sign-up page (section 5, rule 5). **[Confirm]**
