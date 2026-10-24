# CampusFlow AI: permission model draft (v0.1)

Phase 2, step 2. A design draft, **not** code. Not final until the owner approves it. Items marked **[Confirm]** are choices Claude made that the owner should check.

Related documents: `mvp-scope.md` (section 6 has the first role matrix), `data-model-draft.md` (tables `roles`, `permissions`, `role_permissions`, `class_faculty`, `class_members`, `team_members`).

---

## 1. Principles

1. **Every protected action is checked on the server.** Hiding a button is a convenience, never security.
2. **Two different questions, kept separate.**
   - _Permission_ (admin-editable): is this kind of user allowed to perform this kind of action at all? Example: may a Faculty create a class? ~ Admins will have all the rights that a student and a facutly has but with some extra rights that only admins can access.
   - _Ownership or relationship_ (fixed in code): is this user connected to this specific record? Example: is this Faculty a teacher of _this_ class? ~ Well ownership of a class means that teacher has the rights to add or remove co-teachers and archive the class. Relationship means that that teacher is a co-teacher. A co-teacher can be a owner of a different class and a owner can be a co-teacher of a different class.
     An admin can change the first. Nobody can change the second from the Admin page. Admins will have the rights of both teacher and a student so that if there is a deadlock somewhere they can resolve it.
3. **Privacy rules are not permissions.** There is no permission key for "view another user's personal tasks" or "view another user's Growth Tracker", so no configuration can grant it.
4. **Deny by default.** If no rule allows an action, it is refused.
5. **Permission changes take effect on the next request.** Permissions are read from the database per request; they are never baked into a login token.

## 2. The check pipeline

Every action goes through these steps in order. The first failure stops the action.

| #   | Check          | Question                                                                                                                                       | Where the answer comes from                               |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Signed in      | Is there a valid session?                                                                                                                      | Better Auth session                                       |
| 2   | Account status | Is `users.status` = active? Pending, rejected and deactivated users are refused everywhere except sign-out and the "waiting for approval" page | `users.status`                                            |
| 3   | Permission     | Does the user's role have the permission key for this action?                                                                                  | `role_permissions`                                        |
| 4   | Relationship   | Is the user connected to this specific record (teacher of the class, assignee of the task, active team member)?                                | `class_faculty`, `class_members`, `tasks`, `team_members` |
| 5   | State          | Does the record's current state allow it (assignment open, code not expired, task not deleted)?                                                | The record itself                                         |

Steps 1 to 3 do not need the record. Steps 4 and 5 do.

## 3. Permission keys and default grants

Seeded from code. Admins can assign existing keys to roles; they cannot create new keys. A key marked **locked** cannot be removed from Admin and cannot be granted to other roles.

Legend: S = Student, F = Faculty, A = Admin. A blank cell means not granted by default.

### Admin module

| Key                          | Meaning                                                 | S   | F   | A   | Locked |
| ---------------------------- | ------------------------------------------------------- | --- | --- | --- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| admin.dashboard.view         | See the admin overview (pending approvals, user counts) |     |     | Yes |        |
| admin.users.view             | See the user list                                       |     |     | Yes |        |
| admin.users.approve          | Approve or reject new accounts                          |     |     | Yes | Yes    |
| admin.users.assign_role      | Set a user's role                                       |     |     | Yes | Yes    |
| admin.users.deactivate       | Deactivate or reactivate accounts                       |     |     | Yes |        |
| admin.roles.edit_permissions | Edit which keys each role has                           |     |     | Yes | Yes    | ~ admins can change the permissons given to a role. But the permissions will be fixed so they can't invent any new permissions. |
| admin.audit.view             | Read the audit log                                      |     |     | Yes |        |

### Classes

| Key                  | Meaning                                                                        | S   | F   | A   | Locked |
| -------------------- | ------------------------------------------------------------------------------ | --- | --- | --- | ------ |
| class.create         | Create a class                                                                 |     | Yes |     |        |
| class.view           | See classes you belong to                                                      | Yes | Yes |     |        |
| class.manage         | Edit or archive a class; add or remove co-teachers (owner only, see section 4) |     | Yes |     |        |
| class.code.manage    | Generate, deactivate or extend enrollment codes                                |     | Yes |     |        |
| class.members.manage | View the roster, remove students, decide leave requests                        |     | Yes |     |        |
| class.join           | Join a class with a code                                                       | Yes |     |     |        |
| class.leave.request  | Ask to leave a class                                                           | Yes |     |     |        |

### Assignments, submissions, grading

| Key               | Meaning                                                                 | S   | F   | A   | Locked |
| ----------------- | ----------------------------------------------------------------------- | --- | --- | --- | ------ |
| assignment.post   | Create an assignment (all or selected students, attachments)            |     | Yes |     |        |
| assignment.manage | Edit, change the due date, close, grant resubmission                    |     | Yes |     |        |
| assignment.view   | See assignments addressed to you (Student) or in your classes (Faculty) | Yes | Yes |     |        |
| submission.create | Submit and resubmit your own work                                       | Yes |     |     |        |
| submission.view   | See submissions (your own for Student; your classes' for Faculty)       | Yes | Yes |     |        |
| submission.grade  | Give or edit marks and comments                                         |     | Yes |     |        |

### Tasks, teams, files

| Key                  | Meaning                                                            | S   | F   | A   | Locked |
| -------------------- | ------------------------------------------------------------------ | --- | --- | --- | ------ |
| task.personal.manage | Create and manage your own personal tasks and subtasks             | Yes |     |     |        |
| task.team.manage     | Create, edit and assign tasks in teams you are an active member of | Yes |     |     |        |
| team.create          | Create a team                                                      | Yes |     |     |        |
| team.view            | See teams you are an active member of, and your invitations        | Yes |     |     |        |
| team.members.manage  | Invite or remove members (team creator only, see section 4)        | Yes |     |     |        |
| file.upload          | Upload a file (what it may be attached to is decided by section 4) | Yes | Yes |     |        |

Downloading a file has **no permission key**: it is decided entirely by the relationship rules in section 4.

### Dashboards, trackers, AI

| Key                    | Meaning                                                    | S   | F   | A   | Locked |
| ---------------------- | ---------------------------------------------------------- | --- | --- | --- | ------ |
| dashboard.student.view | Student dashboard                                          | Yes |     |     |        |
| dashboard.faculty.view | Faculty class overview                                     |     | Yes |     |        |
| tracker.personal.view  | Your own Growth Tracker                                    | Yes |     |     |        |
| tracker.class.view     | Class tracker (assigned versus submitted) for your classes |     | Yes |     |        |
| ai.breakdown.use       | Use the AI task breakdown                                  | Yes |     |     |        |
| ai.summary.use         | Generate your weekly AI summary                            | Yes |     |     |        |

Total: 32 keys. Each page in the app requires one key; the menu hides pages whose key the user lacks, and the server checks again.

## 4. Relationship (ownership) rules, fixed in code

| Record                                  | Who may read                                                                                                                      | Who may change                                                                                                 | Notes                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Personal task and its subtasks          | The owner only                                                                                                                    | The owner only                                                                                                 | Not Faculty, not Admin                                                                     |
| Assignment task (the student's copy)    | The assignee; Faculty of that class see its status and submission, not its subtasks                                               | The assignee changes status and subtasks; the deadline, deletion and reopening are not allowed for the student | Subtasks a student adds (including AI breakdowns) are private to the student **[Confirm]** | ~ Yes teachers can only view the parent tasks not the subtasks it will keep the flow simple.  |
| Assignment                              | Faculty of the class; students who are **recipients**                                                                             | Faculty of the class                                                                                           | A student not selected as a recipient cannot see it                                        |
| Submission                              | The submitter and the class Faculty                                                                                               | The submitter creates versions; nobody edits an old version                                                    | Nobody else, including Admin **[Confirm]**                                                 | ~ If we can we should let admins have the rights to view the tasks or will it be complicated? |
| Grade                                   | The graded student and the class Faculty                                                                                          | Class Faculty                                                                                                  |                                                                                            |
| Class                                   | Its Faculty (owner and co-teachers); its active student members (limited view: name, teachers, their own assignments)             | See co-teacher powers below                                                                                    | Students do not see other students **[Confirm]**                                           | ~ Yes students cannot see other students or the submissions the other students made.          |
| Enrollment code                         | Class Faculty                                                                                                                     | Class Faculty                                                                                                  |                                                                                            |
| Team and team tasks                     | Active members only. An invited user sees only the invitation (team name, inviter)                                                | Active members for tasks; the creator for membership                                                           |                                                                                            |
| File                                    | Via its parent: assignment attachments go to recipients and class Faculty; submission files go to the submitter and class Faculty | The uploader, within the file rules in the scope document                                                      | Always served through a server route that runs these checks                                |
| Personal Growth Tracker, AI suggestions | The owner only                                                                                                                    | The owner                                                                                                      |                                                                                            |
| Class tracker                           | Class Faculty (owner and co-teachers)                                                                                             | n/a                                                                                                            | Aggregated assigned versus submitted data                                                  |
| User list, audit log, role permissions  | Admin                                                                                                                             | Admin                                                                                                          |                                                                                            |

### Co-teacher powers **[Confirm]** ~ Yes this works, but keep in mind that a owner can be co-teacher of some other class and a co-teacher can be a owner of some other class so the rights should not be violated.

- **Owner:** everything a class Faculty can do, plus adding or removing co-teachers and archiving the class.
- **Co-teacher:** everything else (post and manage assignments, grade, manage codes and members, see the class tracker).

## 5. Locked rules (cannot be changed from the Admin page)

1. The three roles are fixed. They cannot be created, renamed or deleted.
2. The Admin role always keeps every `admin.*` key marked locked, and those keys cannot be granted to Student or Faculty. This prevents a mistake that locks everyone out or hands out account control. **[Confirm]** Other keys can be freely granted or removed. ~ But the admin can grant other user the role of admin that should not be blocked.
3. The last active admin cannot be deactivated or have their role changed.
4. Nobody can approve themselves, change their own role, or deactivate themselves.
5. No key exists for reading another user's personal tasks, personal tracker or AI history.
6. Every change to roles, permissions or account status is written to `audit_logs` in the same database transaction as the change.
7. Deactivating a user ends their active sessions (verify how Better Auth supports this).

## 6. Where the checks live

Four layers, strongest first:

1. **Data access functions (the real enforcement).** Every function that reads or writes data takes the acting user and scopes the query: for example "tasks where assignee = this user", never "task by id". A record the user cannot access is simply not found.
2. **Policy functions.** One small function per rule, for example `canGradeSubmission(user, submission)`. Server actions and route handlers call them. They are plain functions, so they can be tested without a browser.
3. **Next.js middleware (coarse only).** Redirects visitors who are signed out or pending. It must never be the only check; verify the current Next.js behavior and known bypass issues when we build it.
4. **The UI.** Hides buttons and menu items based on the user's permission set. A convenience only.

The user's permission set is loaded once per request (not stored in the session token) and passed to the policy functions.

Folder locations will be decided in step 3 (folder structure). Provisional: `src/server/auth/` for session and permission loading, `src/server/policies/` for the policy functions, `src/server/data/` for scoped data access.

## 7. The Admin page

- **Users:** list with status filter; approve or reject pending accounts and choose the role; change a role; deactivate or reactivate.
- **Roles and permissions:** a grid of permission keys (rows, grouped by module) by roles (columns) with checkboxes. Locked cells are shown disabled. Each key has a plain-language description. A "restore defaults" button resets a role to the seeded grants.
- **Audit log:** read-only, filterable by actor and action.
- Admin does not see personal tasks, personal trackers, or submission content. ~ Once consider my point that I mentioned above regarding the rights to admin.

## 8. How this will be tested

A table-driven test suite (written with the permission code, not after it). Each case is: acting user type, action, record relationship, expected result (allow or deny).

Acting user types: signed out, pending, student non-member, student member (not recipient), student recipient, other student, faculty owner, faculty co-teacher, faculty of another class, admin.

Example cases:

- Pending user opens the dashboard: denied.
- Student reads another student's submission: denied.
- Student not selected as a recipient opens the assignment: denied.
- Co-teacher archives the class: denied. Owner archives it: allowed.
- Admin removes `submission.grade` from Faculty: Faculty cannot grade on the next request.
- Admin removes a locked key from the Admin role: refused.
- Last admin deactivates themselves: refused.
- Downloading a submission file with its direct URL while not authorized: denied.

Every item in section 4 and section 5 becomes at least one test.

## 9. Open decisions

1. Co-teacher powers (section 4). ~ Agreed
2. Locked keys: only the three `admin.users.approve`, `admin.users.assign_role`, `admin.roles.edit_permissions` are locked to Admin; all other keys, including the other `admin.*` ones, can be granted to other roles. **[Confirm]** ~ Agreed with a suggestion I wrote above.
3. Students cannot see the class roster. **[Confirm]** ~ Agreed
4. Subtasks a student adds under an assignment task stay private. **[Confirm]** ~ Agreed with the admin suggestion.
5. Admin cannot open submission files. **[Confirm]** ~ Agreed with the admin suggestion.
