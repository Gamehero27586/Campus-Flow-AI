# Slice 2 plan: the full permission pipeline

Written 25 Oct 2026 by Claude (Opus) for Claude (Sonnet), after Slice 1 was merged to `main` (`57b755a`). The owner reviews this plan before you start. `docs/decisions.md` still wins if anything here disagrees with it; if you find a disagreement, stop and ask.

**Read first:** `CLAUDE.md`, `docs/decisions.md` (especially §17, Slice 1 notes), `docs/permissions.md` (§2, §4, §5, §6, §7, §9), the Slice 2 row in `docs/mvp-scope.md` §11, and `docs/reviews/slice-1-opus-review.md` (items N3, N5 and N6 were deferred). Git stays the owner's job: never run a git command that changes anything.

---

## 1. Goal and exit check

**Goal:** finish the five-step check from `permissions.md` §2 so every later slice can copy one pattern, make the audit log tamper-proof, show the permission grid (read-only), and prove all of it with a table-driven test suite that grows with every slice.

**Exit check (from `mvp-scope.md` §11, made concrete):**
1. Every existing server action and page goes through steps 1 to 5. The rules that are now inline in `src/server/admin/commands.ts` live in policy functions.
2. `audit_logs` rejects UPDATE, DELETE and TRUNCATE at the database level, proven by a test.
3. `/admin/roles` shows the grid read-only, and the server ignores any grant the code does not allow.
4. The permission matrix test runs every existing action against every actor type, and a guard test fails if someone adds a server action without matrix rows.
5. The first Playwright flow passes against a production build.
6. `typecheck`, `lint`, `test`, `test:e2e` and `npm audit` pass. Docs updated (section 6).

**Estimate:** 14 to 20 hours (the plan's 12 to 18, plus the Playwright flow moved here from Slice 1).

## 2. What already exists (do not rebuild)

- Steps 1 to 3: `evaluateAuthorization()` (pure) in `src/server/policies/evaluate.ts`, and `authorize()` and `requirePermission()` in `authorize.ts`. `authorize()` already takes one key or a list that must all be held.
- 23 permission keys with eligible and default roles in `src/server/auth/permission-keys.ts`; `seed:base` writes them.
- `loadPermissionKeys(roleId)` reads grants per request.
- `writeAudit(tx, entry)`, always called inside the change's transaction.
- Admin users page actions: approve, reapprove, reject, reset to pending. Settings actions: time zone, password. Welcome action.
- Unit tables for `gate()` and `evaluateAuthorization()`; PGlite integration tests that mock `@/server/db/client`.

## 3. Work, in order

Stop for the owner's review after **2a**. Its API is the pattern every later slice copies, so it must be right before anything is built on it.

### 2a. Steps 4 and 5: one policy pattern (about 3 to 4 h)

**Design (keep it this simple; propose changes before building anything bigger):**

```ts
// src/server/policies/types.ts
export type Actor = { user: CurrentUser; permissions: ReadonlySet<string> }; // the ok result of authorize()

export type PolicyDecision =
  | { allow: true }
  | { allow: false; reason: "not_found" }                              // step 4: no relationship
  | { allow: false; reason: "state"; code: string; message: string };  // step 5: record state forbids it
```

- Each domain's `policy.ts` exports **pure** functions `(actor, record) => PolicyDecision`. They check the relationship first (step 4), then the state (step 5). No database access inside a policy: the caller loads the record and passes it in.
- `src/server/policies/decide.ts`: one helper that turns a decision into the action result (`not_found` becomes `fail("not_found", "... not found")`, and `state` becomes `fail(code, message)`). A second helper does the same for pages (`not_found` calls `notFound()`; `state` returns the message for the page to show).
- `src/server/policies/admin-access.ts`: `hasAdminReadAccess(actor)` is true when the actor holds `admin.override`. Policies for tier 2 and tier 3 records will use it **for reads only** (from Slice 6 on). Add it now with its tests, because the "Admin never writes academic records" rule must exist before the first academic record does.
- **Not now:** the class owner and co-teacher helper. It belongs to Slice 6, when `class_faculty` exists. Do not build helpers for tables that do not exist yet.

**Apply it to what exists today:**
- `src/server/admin/policy.ts`: `canApprove`, `canReapprove`, `canReject`, `canResetToPending`, all `(actor, target)`. Step 4: the target exists and is not the actor (the self rule is a relationship rule). Step 5: the status is right for the action, a username is set (approve and reapprove), and an unverified email has the confirmation tick. Move these rules out of `commands.ts`. The commands load the row inside the transaction, call the policy, and **keep** the conditional `UPDATE ... WHERE status = ...` (that is the race protection, not a duplicate rule).
- `src/server/users/policy.ts`: `canCompleteWelcome` (no username yet; the account is not rejected or deactivated), `canChangePassword` (the account has a password login). The time zone needs no policy beyond "it is your own row".
- Action shape after this (matches `CLAUDE.md`): parse with Zod, `authorize(keys)`, load the record scoped to the actor, `decide(policy(actor, record))`, one command, revalidate, return.

**Tests:** a unit table per policy file (every reason code and every allowed case), plus a table for `hasAdminReadAccess`.

### 2b. Append-only audit log (about 1 to 2 h)

- Migration `0002`: a plpgsql function `forbid_modification()` that raises an exception, a `BEFORE UPDATE OR DELETE ... FOR EACH ROW` trigger on `audit_logs`, and a `BEFORE TRUNCATE ... FOR EACH STATEMENT` trigger. Name the function generically: Slice 3 reuses it for `task_events`. Write the SQL by hand in a Drizzle custom migration (`drizzle-kit generate --custom`) **[Verify]** the current flag. Never edit `0000` or `0001`.
- **[Verify]** that PGlite runs plpgsql triggers (`decisions.md` §16 says re-check). If it does not, stop and tell the owner; the fallback is a local Postgres test database.
- **Existing tests will break and must change, not the trigger.** `admin-approval.test.ts` deletes `auditLogs` in `beforeEach`, and `seed-and-promote.test.ts` deletes `auditLogs` and `users` (the users delete also fails, because `audit_logs.actor_id` references users). Fix by giving each test file or `describe` its own fresh PGlite database, or by asserting on rows filtered by `targetId` instead of clearing the table. **Never add a bypass setting to the trigger.**
- **Tests:** an insert works; UPDATE, DELETE and TRUNCATE each fail; a failed audit insert still rolls back the change (that test exists; keep it passing).
- Note for `decisions.md`: users who appear in the audit log can no longer be deleted (deactivate them instead, in Slice 10). To clean a development database, recreate it.

### 2c. Grants must match the code, and the read-only grid (about 3 to 4 h)

- **Defence in depth in `loadPermissionKeys`:** return only keys that exist in `PERMISSIONS` **and** whose `eligible` list contains the role's key. A grant added by hand in the database (for example `class.create` for Student) is then ignored. The function needs the role key, so join `roles`. Tests: an ineligible grant row and an unknown key row are both ignored.
- **Query** `src/server/admin/queries.ts` `getPermissionGrid(actor)`: modules, then keys (key, description, locked), and for each of the three roles one state: `granted`, `eligible` (allowed but not granted), `not_eligible`, or `ignored` (a grant row exists but the code forbids it). Plain objects only.
- **Page** `/admin/roles`, key `admin.roles.edit_permissions`: one table per module. Rows are keys with their description; columns are Student, Faculty, Admin. Show each state with an icon **and** a word (never colour alone, in both themes). Mark locked keys. Show `ignored` in the destructive colour with "Grant ignored: not allowed for this role". A line at the top: "Read-only. Editing comes in a later version." Add **Roles** to the Admin part of the menu, shown only to holders of the key.
- Follow `color-palette.md` and the dark-mode tokens; `theme-contrast.test.ts` must still pass.

### 2d. The permission matrix harness (about 4 to 5 h)

The core deliverable. Build it so later slices add rows, not machinery.

- `tests/permissions/actors.ts` creates each actor type in PGlite: signed out, no username yet, pending, rejected, deactivated, student, faculty, admin, and **admin without `admin.users.assign_role`** (grid edited). It also creates the target records each action needs (a pending user, a rejected user, and so on).
- `tests/permissions/matrix.test.ts`: one table, `[actor, action, target, expected]`. `expected` is one of `allow`, `redirect:<path>`, `not_found`, `state:<code>` or `missing_permission`. It calls the **real** server actions and page data functions, not only policies:
  - mock `@/server/db/client` with PGlite (as today), and `@/server/auth/current-user` to return the actor;
  - mock `next/navigation` so `redirect()` and `notFound()` throw tagged errors the harness can read, and `next/cache` so `revalidatePath()` does nothing;
  - build `FormData` for each action.
- **Rows required now:** every action in `src/app/**/actions.ts` (approve, reapprove, reject, reset to pending, time zone, password, welcome) and every page's access check (`/dashboard`, `/settings`, `/welcome`, `/pending`, `/admin`, `/admin/users`, `/admin/roles`), each against all nine actor types. Include the cases already listed in `permissions.md` §9 that apply to Slice 1 and 2 records.
- `tests/permissions/coverage.test.ts`: a guard. It finds every exported function in `src/app/**/actions.ts` and every `page.tsx` under `src/app/(app)` and `src/app/(onboarding)`, and fails if one has no matrix row. From Slice 3 on, forgetting the permission rows for a new action fails CI.
- One integration test for "a permission change takes effect on the next request": a student passes the `/dashboard` check; delete Student's `dashboard.view` grant in PGlite; the next check returns "not found".

### 2e. First Playwright flow (about 2 to 3 h; deferred N5)

Flow: sign up, sign in, welcome (username and requested role), pending page; the Admin signs in and approves as Student; the student reaches `/dashboard`; the student gets "not found" on `/admin/users`. One flow, written so the next two flows (Slices 7 and 12) can reuse its helpers.

- **Fix first:** `playwright.config.ts` uses `http://127.0.0.1:3000`, but Better Auth refuses any origin other than `BETTER_AUTH_URL` (`http://localhost:3000`). Use the same address in both places, or sign-in fails with "invalid origin" (review N4).
- **Database:** a separate e2e database, never the development data. Prefer a local PostgreSQL database `campus_flow_e2e` if the owner has installed Postgres; otherwise a Neon branch. **Ask the owner which one** before writing this part. Pass its URL through `webServer.env` so `next start` uses it (environment variables override `.env.local`). A global setup runs the migrations and `seed:base`, creates the Admin through the same code `admin:promote` uses, and starts from an empty users table.
- Run against `npm run build` then `npm start` (production mode, so rate limits are on; the flow signs in only a few times).
- The owner runs `npx playwright install chromium` once. CI does not run e2e yet (no database in CI); say so in `decisions.md`.

## 4. Out of scope for Slice 2

Grid **editing**, the audit log viewer, Admin class and team views, transfers, deactivate and reactivate, role change and reset links (all Slice 10); the class capacity helper (Slice 6); the `task_events` trigger (Slice 3, reusing `forbid_modification()`); any new table besides the migration in 2b. If something here seems to need one of these, stop and ask.

## 5. Security checks for this slice

- Step 4 failures are always "not found", never "forbidden", in pages and actions alike.
- No policy reads the database. No page or action skips `authorize()`, the layout check included.
- `hasAdminReadAccess` is never used to allow a write. Add a test that every policy for a write returns `not_found` for an Admin who has no relationship (today that means the self rule; from Slice 6, academic records).
- Ineligible or unknown grants are ignored by `loadPermissionKeys` (2c).
- The audit trigger cannot be bypassed by any setting or role the app uses.
- At the end of Slice 2, stop and suggest the security review in a separate session (`CLAUDE.md`), before the owner merges.

## 6. Documents to update in this slice

- `permissions.md` §2 and §7: the `PolicyDecision` pattern, the `decide` helpers, and where `hasAdminReadAccess` lives.
- `folder-structure.md` §3: `src/server/policies/` now holds `authorize.ts`, `evaluate.ts`, `types.ts`, `decide.ts` and `admin-access.ts`; `tests/permissions/` holds the matrix and its guard.
- `decisions.md`: a new **§19 Slice 2 notes**, after §17. Keep "Still open" last (renumber it). Record the trigger approach, the test-database change for audit rows, the eligibility filter, the e2e database choice, and "CI does not run e2e yet".
- `permissions.md` §9: mark which listed cases are now covered by the matrix.

## 7. How to work through it

1. Say what you will build in 2a (files, function signatures, test table). **Wait for the owner's go-ahead.**
2. Build 2a, then 2b, 2c, 2d, 2e. After each part: run `typecheck`, `lint` and `test`; list the changed files; say what the owner should try in the browser. The owner commits each part on `dev-Arjun`.
3. Before 2e, ask the owner about the e2e database.
4. At the end: the full checks, the docs from section 6, and a suggestion to run the Slice 2 security review.

## 8. For the owner (before or during the slice)

- Remove the three leftover files from the Slice 1 review if they are still there: `.git\stale-index-lock-opus-review`, `.git\stale-index-lock-opus-review-2`, `.git\opus-review-src.tgz.tmp`.
- Decide where the e2e tests' database lives: local Postgres (install it now; it is also your demo fallback) or a Neon branch.
- Run `npx playwright install chromium` once.
- Still open from `decisions.md` §18: the coral or teal secondary buttons (D4) must be decided **before Slice 3**.
