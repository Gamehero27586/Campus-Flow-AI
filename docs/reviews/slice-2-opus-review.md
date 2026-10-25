# Slice 2 (permission pipeline): Opus review

Reviewed 25 Oct 2026 by Claude (Opus) on the uncommitted Slice 2 work in `C:\dev\campus-flow-ai`, against `docs/slices/slice-2-plan.md`, `CLAUDE.md`, `decisions.md` §18, `permissions.md` and the Slice 1 review. This is the end-of-Slice-2 security review `CLAUDE.md` asks for. Scope: loopholes (security) and whether the slice does what it should (functionality).

**For Sonnet:** apply the items the owner approves, in the order of section 3, with the tests named in each row. Never run a git command that changes anything. When done, list the changed files and run `typecheck`, `lint`, `test`, `test:e2e` and `npm audit`.

---

## 1. Verdict

**Commit after three fixes (about 4 to 6 hours). One of them closes a real loophole.**

Done well:
- The pipeline engine (`evaluate-record.ts`). Steps run in order; the record is loaded only after steps 1 to 3 pass; a missing record and a hidden one look identical; a step 4 refusal never reaches step 5.
- `admin-access.ts`. Personal records can never be read by Admin, whatever the keys; Admin writes are limited to the two transfers.
- The append-only trigger. Refuses UPDATE, DELETE and TRUNCATE, checked on PGlite and on Neon, without a bypass. The tests were changed instead of the trigger.
- The grid page, the plain-language problem warnings, the typed audit action names, and the test-database guard for the destructive scripts.
- Expected results in the tests are written by hand instead of computed from the code; the later-slice permission cases are visible as `todo`.
- The first Playwright flow covers exactly the right path.

**Checks run during this review:** `tsc --noEmit` and `eslint .` both passed (read-only, against the installed packages on the laptop). **Not run here:** `npm run test`, `npm run test:e2e` and `npm audit`; the test runner needs Windows-native binaries. The owner runs them.

The three things that matter:
1. **A database grant the code forbids still works** (L1). The grid *warns* about it, but the server *honours* it. Combined with `admin.override`, one stray row could give a student read access to every class.
2. **The tests prove the lock works, not that every door has one** (L2). No test checks that each real action or page asks for the right key, and nothing fails if a new action forgets `authorize()`. That is exactly the mistake most likely in Slices 3 to 11.
3. **The new pattern is used nowhere yet** (L3). `authorizeRecord()` is tested in isolation only; its loader signature has a flaw that the first real use would hit.

---

## 2. Findings

Severity: **Should fix** = before committing Slice 2. **Docs** = a document must change. **Nice** = optional or later. **[Unsure]** = check before relying on it.

### 2.1 Should fix

| ID | Finding | Where | Change | Test to add | Effort |
|---|---|---|---|---|---|
| L1 | **Ineligible and unknown grants are honoured.** `readPermissionKeys` returns every key granted to the role in the database. The plan (2c) required it to keep only keys that exist in `PERMISSIONS` **and** list the role as eligible. Today a row "Student holds `admin.override`", added by hand, by a bad migration or later by a buggy grid editor, gives that student Admin's read access to every class, submission and grade from Slice 6 on. A Student `class.create` row lets a student create classes. The grid shows "Problem", but the server still says yes. | `src/server/auth/read-permissions.ts` | Join `roles` to get the role key; return only keys that are in `PERMISSIONS` and whose `eligible` list contains that role key. Ignored grants stay visible as "Problem" on the grid (the grid reads grants separately, so it keeps working). | In `permission-grid-and-live-permissions.test.ts`: insert Student `class.create` and Student `admin.override` rows; `readPermissionKeys` returns neither, and a student is refused `class.create`. An unknown key row is ignored too | 1 h |
| L2 | **Nothing ties the real actions and pages to their keys.** `pipeline-table.test.ts` passes a key into the pure evaluator by hand (for example `["admin", "approve a user", APPROVE, "allowed"]`). If an action asked for the wrong key, or skipped `authorize()` entirely, every test would still pass. The plan's 2d asked for (a) a matrix that calls the **real** actions and page checks and (b) a guard test that fails when an action or page has no rows. Neither exists. | `tests/permissions/` (new) | **(a) Guard test, `tests/permissions/coverage.test.ts`:** list every exported function in `src/app/**/actions.ts` and every `page.tsx` under `src/app/(app)` and `src/app/(onboarding)`. Fail if one is missing from a hand-written map `{ name: required keys or "gate" }`. Also fail if a listed action file does not call `authorize(`, `authorizeRecord(` or `gate(`, or a page does not call `requirePermission(` or `gate(` (a simple source check). **(b) Real-action matrix, `tests/permissions/actions-matrix.test.ts`:** mock `@/server/db/client` (PGlite) and `@/server/auth/current-user` (the actor), mock `next/navigation` (`redirect`, `notFound` throw tagged errors) and `next/cache`; call each of the 7 existing actions with real `FormData` for signed out, pending, student, faculty, admin, and admin without `admin.users.assign_role`. Expected results written by hand. | as described | 3 to 4 h |
| L3 | **`authorizeRecord()` is unused, and its loader cannot scope for Admin.** The loader receives only `user`, not `permissions`. From Slice 6 on, a loader must scope its query as "rows this user is related to, **or** any row if the user may read as Admin". Without `permissions` the loader cannot know that, so it is pushed towards loading by id and leaving the decision to the rule, which breaks `CLAUDE.md` security rule 3 ("never get by id without a scope"). Also, the admin user actions still check their rules inline in `commands.ts` (plan 2a, "apply it to what exists today"), so the pattern Slice 3 will copy has never run in real code. | `src/server/policies/evaluate-record.ts`, `authorize.ts`; `src/server/admin/commands.ts` | Change `loadRecord` to receive `{ user, permissions }` (the same object the rules get). Then move the admin users rules into `src/server/admin/policy.ts` (relationship: the target exists and is not the actor; state: the right status, a username for approve and reapprove, the email confirmation) and call them through `authorizeRecord()` in the four admin actions. Keep the conditional `UPDATE ... WHERE status = ...` in the commands: it is the race protection, not a second copy of the rule. Existing `admin-approval.test.ts` cases must still pass unchanged. | Unit table for `admin/policy.ts`; one record-pipeline test that the loader receives the permissions | 1.5 to 2 h |

### 2.2 The shared test password (owner's choice, kept)

The shared password is a fair convenience for the testing phase and stays. Two cheap guards keep it from causing harm:

| ID | Finding | Change | Effort |
|---|---|---|---|
| T1 | the shared test password is written in `scripts/lib/test-credentials.ts`, which will be committed, and `tests/e2e/support.ts` has the owner's personal email as the Admin. Git history keeps both forever, even after the testing phase. The Slice 2 files are not committed yet, so nothing has leaked. | Read both from `.env.local`: `TEST_ACCOUNT_PASSWORD` and `E2E_ADMIN_EMAIL` (add empty lines to `.env.example`). The scripts and the e2e flow stop with a clear message if they are missing. Same password, same convenience, nothing in Git. | 20 min |
| T2 | The decision says the test database must never be served on a public address, but nothing enforces it. One quick tunnel demo on the test database would expose an Admin with a known password. | In `src/env.ts`: when `DEV_DB_RESET_ALLOWED=yes` (the marker of the test database), refuse to start unless `BETTER_AUTH_URL` is `localhost` or `127.0.0.1`. The message says: "This is the test database (shared test password). It can only be served on localhost." Unit test in `env.test.ts`. | 20 min |

### 2.3 Docs

| ID | Change |
|---|---|
| D1 | `decisions.md` §18: record L1 (grants filtered by eligibility on every read), L3 (loader receives permissions; admin actions use `authorizeRecord`), the guard test and real-action matrix (L2), and T1 and T2. |
| D2 | `permissions.md` §2 and §7: describe the pattern as built (`Decision` with `not_found`, `not_allowed`, `state`; `authorizeRecord({ required, loadRecord, rules })`; `adminMayRead` and `adminMayWrite`). Add one rule for later slices: **use `not_allowed` only when the person may already see the record** (otherwise it reveals that the record exists); in every other case use `not_found`. |
| D3 | `folder-structure.md` §3: `src/server/policies/` now holds `authorize.ts`, `evaluate.ts`, `evaluate-record.ts`, `decision.ts`, `admin-access.ts`; `tests/permissions/` holds the guard and the actions matrix; `scripts/` gains `db-reset.ts`, `set-test-passwords.ts` and `lib/`. |
| D4 | `CLAUDE.md` "Tests": every new server action or page needs rows in the actions matrix and the coverage map; the guard test fails otherwise. |

### 2.4 Nice to have, or later

| ID | Finding | Change | When |
|---|---|---|---|
| N1 | `adminMayWrite(permissions, action: string)` accepts any string, so a typo compiles and silently returns false | Type `action` as `AdminWriteAction` | Now, 5 min |
| N2 | The e2e flow signs in as the real Admin and leaves one new student and one audit row in the test database each run, and the rate limit means waiting a minute between runs | Fine for now; `npm run db:reset` cleans up. Revisit when the second and third flows arrive (Slices 7 and 12) | Later |
| N3 | The test-database guard passes when `DATABASE_URL_LIVE` is empty (it is today, because the live database does not exist yet). Once the live database exists, the guard only protects it if its string is saved | Add a line to the go-live checklist in `decisions.md` §12: save `DATABASE_URL_LIVE` the day the live project is created | When going live |
| N4 | `seed:base` restores a locked key only if no role holds it; with L1 fixed, the grid's "locked key missing" warning is the only signal | Fine; Slice 10 (grid editing) refuses to remove locked keys anyway | Slice 10 |

---

## 3. Order of work for Sonnet

1. T1 and T2 (before anything is committed, so the password and email never reach Git).
2. L1 with its tests.
3. L3: loader signature, then `src/server/admin/policy.ts`, then the four admin actions through `authorizeRecord()`.
4. L2: the guard test first (it should fail until the map is complete), then the real-action matrix.
5. N1 if approved; D1 to D4.
6. Run `typecheck`, `lint`, `test`, `test:e2e`, `npm audit`; list the changed files. The owner commits.

---

## 4. Functional walk-through

| Area | Result |
|---|---|
| `/admin/roles`: grouped by module, words and icons, locked keys marked, warning box when the database disagrees, Admin-only menu item, "not found" for others | Works as planned |
| Live permission change (grant removed, next request refused); deactivated account with an open session refused | Works, tested |
| Audit log: insert works, update, delete and truncate refused, rollback with the change | Works, tested on PGlite and Neon |
| `db:reset` and `test-users:passwords` refuse without the switch or against the live database | Works, tested |
| Playwright: sign up, welcome, pending (app pages bounce), Admin approves, student reaches the dashboard, "not found" on Admin pages, no Admin menu links | Works on a production build on port 3100 (owner to confirm it passes twice in a row) |
| Plan exit check 1 (existing actions through steps 1 to 5) | **Not met** (L3) |
| Plan exit check 4 (matrix of real actions plus guard) | **Not met** (L2) |

---

## 5. Owner checklist before committing

1. After Sonnet's fixes: run `npm run test`, `npm audit` and `npm run test:e2e` (twice, a minute apart).
2. Put `TEST_ACCOUNT_PASSWORD` and `E2E_ADMIN_EMAIL` in `.env.local` (T1).
3. Quick hand check of L1: in `npm run studio`, add a row giving Student `class.create`. The grid shows "Problem", and with the fix the server ignores it. Remove the row afterwards.
4. Delete the three leftover files from the Slice 1 review, still in `.git`: `stale-index-lock-opus-review`, `stale-index-lock-opus-review-2` and `opus-review-src.tgz.tmp`.
5. Commit on `dev-Arjun`, merge, tag `slice-2-done`.
6. Before Slice 3: decide D4 (coral or teal secondary buttons, `decisions.md` §19).

---

## 6. Re-review (26 Oct 2026): ready to commit

All the "Should fix" items and T1 and T2 are applied and checked in the code. `tsc --noEmit` and `eslint .` pass; the owner runs `test`, `test:e2e` (twice) and `npm audit` before committing.

| ID | Status |
|---|---|
| L1 | Fixed. `readPermissionKeys` keeps a grant only if the key is known and the role is eligible; the grid still shows stray rows as problems. Tested in `tests/integration/ineligible-grants.test.ts` |
| L2 | Fixed. `tests/permissions/coverage.test.ts` maps every server action, page, layout and route handler to its check and keys and fails on anything unlisted; `tests/permissions/actions-matrix.test.ts` calls the real actions for ten kinds of actor. Both were shown to fail when a check was removed |
| L3 | Fixed. `loadRecord` receives `{ user, permissions }`; the Admin Users rules live in `src/server/admin/policy.ts` and all four actions use `authorizeRecord()`; the commands re-run the same rules inside their transaction |
| T1 | Fixed, stricter than proposed (owner's choice): no password, no personal email and no password script in the repository. A grep of the repository (outside `.env.local`) found neither |
| T2 | Fixed. `src/env.ts` refuses to start the test database on anything but localhost, with an exact host match |
| N1, D1 to D4, N3 | Done |

Two small notes for later (no action needed now):
- `src/server/admin/commands.ts` re-runs the rules with an empty permission set. That is correct today, because no Admin Users rule reads permissions. If a future rule does, pass the actor's real permissions there too, or the in-transaction check will refuse wrongly.
- The SQL statement in `decisions.md` §18 that copies the Admin's password hash to every account must only ever run in the **test** database's Neon console. It is labelled that way; keep it that way.

Remaining owner tasks: delete `.git\stale-index-lock-opus-review`, `.git\stale-index-lock-opus-review-2` and `.git\opus-review-src.tgz.tmp`; commit, merge, tag `slice-2-done`; decide D4 before Slice 3.
