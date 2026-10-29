# Slice 3 (personal tasks): final Opus review

Reviewed 29 Oct 2026: the whole slice, 3a to 3e, including the follow-ups from the 3a, 3b and 3c reviews. Files: the schema and migration `0003`, `src/server/tasks/*`, `src/lib/schemas/tasks.ts`, `src/lib/time.ts`, every file under `src/app/(app)/tasks/`, the tests (schema, commands, queries, policy, schemas, local time, the permission matrix and coverage, `tests/e2e/personal-tasks.spec.ts`) and the docs. `tsc` and `eslint` pass. The owner runs `npm run test`, `npm run test:e2e` (twice, a minute apart) and `npm audit`.

---

## 1. Verdict

**Slice 3 is complete and ready to commit and tag `slice-3-done`.** No security issue was found and nothing blocks. Two small polish items are below; they can wait.

What was checked, and holds:

- **Every earlier finding is closed.** 3a: A1 to A6 are in the schema and tested. 3b: bare offsets are refused everywhere. 3c: C1 (a Done task's deadline is locked) and C2 (rule R-a2: completing a step of a To Do parent starts the parent) are built, tested and recorded in `decisions.md` §19 and `data-flows.md` §2. Migrations `0002` and `0003` are byte-for-byte what was committed; nothing applied was edited.
- **Privacy (tier 1).** Every page and action runs `requirePermission` or `authorizeRecord` with `task.personal.manage`. Every query (list, detail, deleted list, the commands' locked reads) scopes to `context = 'personal' AND assignee_id = user` in SQL. Admin and Faculty are refused on a student's task by every action (tested for 11 kinds of actor), and an invalid or foreign id is "not found" on the detail page.
- **Rules and timestamps.** All of `data-flows.md` §2 and R-a to R-i plus R-a2 are enforced in the commands on the locked row and tested with a fixed clock. Every timestamp comes from one `now()` per command.
- **Screens match the plan.**
  - `/tasks`: Open, Done and All filters, a Deleted link, a first-task prompt, and one primary action per state (Start, or Mark done).
  - `/tasks/[taskId]`: status, Overdue, deadline, rescheduling history, started and finished times; "Complete all?" for open steps; "When did you start?" once, for a never-started task; a deleted task shows only Restore; a Done task explains "Reopen the task to change its deadline" and "Reopen the task to add steps".
  - `/tasks/new` as a page for phones; `/tasks/deleted` with Restore.
  - The Undo toast (8 seconds) calls the restore action.
  - A step deadline after the task's shows the R-e warning.
  - The secondary buttons are teal outline; no raw colours; user text is rendered as plain text; forms keep their fields after an error.
- **Tests.** About 70 command tests, the schema and query tests, the policy table, the coverage guard, and a second Playwright flow (create with steps, start a step, complete all, delete and Undo, restore from Deleted, the phone page and "When did you start?"). The Slice 3 `todo` lines in `later-slices.test.ts` are now real tests.
- **Docs.** `decisions.md` §19, `data-flows.md` §2, `folder-structure.md` (folders and routes), `permissions.md` §9 and `color-palette.md` (D4 closed) are up to date.

## 2. Polish (optional, any time before the demo)

| ID | Finding | Change | Effort |
|---|---|---|---|
| P1 | **The Deleted list repeats steps.** Deleting a task with five steps shows six rows. The five step rows say "Restore the task first" and each has a Restore button the server will refuse | Show steps deleted **at the same moment as their task** inside the task's row ("and 5 steps, restored with it"), without their own button. Keep separate rows only for steps deleted on their own. Add a query test | 30 to 45 min |
| P2 | The Undo toast says "Task deleted" when a step was deleted | Say "Step deleted" for a step | 5 min |
| P3 | **Group the Deleted list by task** (owner's idea, 29 Oct 2026). Steps deleted on their own are scattered among the other rows, so it is hard to see which task they came from. Example: step 3b was deleted on its own, then its task "Slice 3 completion" was deleted; 3b correctly does not come back with the task (rule R-g), but it shows as a separate row | Show one group per task, in order of the latest deletion in the group. The group header is the task: if the task is deleted, its row says which steps come back with it and has **Restore task**. Under it, each step deleted **on its own** (`deleted_at` different from the task's), labelled "Deleted on its own" with its time; its Restore button is **disabled** with "Restore the task first" while the task is deleted, and enabled otherwise. A task that is not deleted but has steps deleted on their own also gets a group (header not restorable, linking to the task). This replaces P1. UI only: no rule or data change; `listMyDeletedTasks` may return the parent's `deleted_at` so the page can tell "deleted with the task" from "deleted on its own". Add a query or page test with the 3b example | about 1 h |

## 3. Next

- **Before committing:** run `npm run test`, `npm run test:e2e` twice (a minute apart, because of the sign-in limit) and `npm audit`.
- **Git:** only `slice-0-done` is tagged; Slices 1 to 3 have no tags yet. Tagging them (`slice-1-done`, `slice-2-done`, `slice-3-done`) makes it easy to show the examiners the project's progress, slice by slice.
- **No security review is due now** (`CLAUDE.md`: after Slices 1, 2 and 7). Slice 4 (AI breakdown) is next and needs a plan: it is the first slice that talks to Ollama, and it adds the coral "Break this down" button and the `ai_suggestions` table with the foreign key from `tasks.ai_suggestion_id`.

---

## 4. Review of the staged changes (29 Oct 2026, 22:45)

45 files staged on `main`: everything above, plus the owner's own changes. What is staged matches the files on disk exactly (nothing unstaged, nothing untracked); `tsc` and `eslint` pass.

**The owner's UI changes are fine:** the "Tasks" menu item; bordered **Back** links with an arrow on the task pages; a **Back** button on Settings that uses the browser's history only after moving inside the app (otherwise it goes to `/`, so it never leaves the app); the teal-outline secondary button with the `cn()` fix that keeps its border. P1 is built (steps deleted with their task are listed inside the task's row) together with part of P3 (Restore is disabled with "Restore the task first" while the task is still deleted). The grouping by task in P3 is still open.

**Phone over Wi-Fi (`DEV_ALLOW_LAN`, `npm run mobile`): carefully done.** It works only in `npm run dev` (`src/env.ts` switches it off in a build, a production run and the tests); it trusts only private IPv4 addresses (10.x, 172.16-31.x, 192.168.x), over http, with no path or user name; it deliberately avoids Better Auth's `*` wildcard, which would also match `192.168.1.evil.com`; `BETTER_AUTH_URL` stays localhost, so the test-database guard is unchanged; it is tested and documented in `decisions.md` §19.

Two small notes, neither blocks the commit:

| ID | Note | Suggestion | Effort |
|---|---|---|---|
| W1 | With `npm run mobile`, **every device on the same network** can open the app, and the test database's accounts (Admin included) share one simple password. **Owner's practice (29 Oct 2026): phone mode is used only over the owner's own phone hotspot**, so the only devices on that network are the owner's. That settles the risk, provided the hotspot keeps its WPA2/WPA3 password and the laptop has no other network connection at the same time (`-H 0.0.0.0` listens on every connected network, an Ethernet cable to a college network included). Phone hotspot addresses (iPhone `172.20.10.x`; Android `192.168.x.x` or `10.x.x.x`) are inside the accepted private ranges | Optional: when `DEV_ALLOW_LAN` is on, print one line when the dev server starts: "Phone mode: use only over your own phone hotspot or home Wi-Fi; the test accounts share a password." Add the hotspot practice to `decisions.md` §19, plus the Windows Firewall tip (a new hotspot is a "Public network"; allow Node.js or mark the connection Private if the phone cannot load the page) | 10 min |
| W2 | `src/lib/local-address.ts` still mentioned `DEV_LAN_ORIGIN`, the old name; the switch is `DEV_ALLOW_LAN` | **Fixed by Opus, 29 Oct 2026** (comment only) | done |
