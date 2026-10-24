# Slice 1 (auth): Opus review

Reviewed 24 Oct 2026 by Claude (Opus) on the uncommitted Slice 1 work in `C:\dev\campus-flow-ai` (branch `dev-Arjun`). Scope: security **and** functionality, checked against `CLAUDE.md`, `decisions.md`, `permissions.md`, `data-flows.md`, `data-model.md` and `folder-structure.md`.

**For Sonnet:** apply the items the owner approves, in the order of section 3, with the tests named in each row. Do not run any git command that changes anything. When done, list the changed files and run `typecheck`, `lint`, `test` and `npm audit`.

---

## 1. Verdict

**Good to commit after a short round of fixes (about 2 to 3 hours). No blockers.**

The core security design is implemented correctly and is well tested:
- App-owned user fields are `input: false` **and** guarded by create and update hooks. Tests prove `sign-up` and `update-user` cannot set status, role, requested role, time zone, approval fields or `is_seed`.
- Status and permissions are read from the database on every request; the cookie cache is off; implicit account linking is off; the risky endpoints are disabled and tested as 404.
- Approval is self-approval-proof, race-safe (status condition in the `UPDATE`), writes its audit row in the same transaction, and a test proves the rollback.
- `admin:promote` refuses once an active Admin exists. No runtime code promotes anyone.
- Pages, layouts and actions each run their own check; `proxy.ts` is convenience only.
- Sign-in and sign-up do not reveal which emails exist.
- The `displayUsername` impersonation hole (Better Auth does not guard that field) was found and closed, with a test. Good catch.

What is left: two fields Better Auth still lets users write freely (`name` length, `image`), a weak secret-generation command, one missing second permission check, reserved usernames, line-ending noise in the diff, and a few documents that no longer match the (correct) code.

**Checks run during this review:** `tsc --noEmit` passed and `eslint .` passed, run read-only against the installed packages on the laptop. **Not run here:** `npm run test` and `npm audit`. The test runner needs Windows-native binaries that cannot run from this review environment. **The owner must run both** before committing, and check that the last GitHub Actions run on `slice-0-setup` was green.

---

## 2. Findings

Severity: **Should fix** = before committing Slice 1. **Docs** = a document must be updated to match the code. **Nice** = optional or for a later slice. **[Unsure]** = check before relying on it.

### 2.1 Should fix

| ID | Finding | Where | Change | Test to add | Effort |
|---|---|---|---|---|---|
| R1 | **`name` has no server-side length limit.** The 100-character limit exists only in the browser form (`signUpSchema`). A direct call to `/api/auth/sign-up/email` or `/api/auth/update-user` can store a name of any length (megabytes), which then appears on the Admin users page and the app shell. | `src/server/auth/create-auth.ts`, `databaseHooks.user.create.before` and `update.before` | Add `NAME_MAX_LENGTH = 100` to `src/config/limits.ts` and use it in `signUpSchema`. In both hooks: if `name` is present, trim it and refuse (APIError `BAD_REQUEST`) when it is empty or longer than the limit. | `auth-hardening.test.ts`: sign-up with a 101-character name is refused; `update-user` with a 101-character or blank name is refused and the row is unchanged; 100 characters is accepted | 0.5 h |
| R2 | **`image` is user-controlled.** Both `sign-up/email` and `update-user` accept any `image` string. Nothing renders it yet, but as soon as an avatar is shown to another user (team members, the Admin list), an arbitrary URL becomes a tracking pixel (it reveals viewers' IP addresses) or broken content. | `create-auth.ts` hooks | `update.before`: refuse `image` (users cannot change it; there is no avatar feature). `create.before`: keep `image` only when the user is created through a social sign-in (Google), otherwise set it to null. **[Verify]** how the hook's context exposes the request path or provider in Better Auth 1.7 (for example `context?.path` starting with `/callback/`). | Sign-up with `image` stores null; `update-user` with `image` is refused | 0.5 to 1 h |
| R3 | **`BETTER_AUTH_SECRET` generation command is not cryptographically secure.** `.env.example` suggests PowerShell `Get-Random`, which is documented as not suitable for secrets. The secret signs session cookies. | `.env.example` | Replace with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Owner:** generate a new secret this way and put it in `.env.local` (everyone is signed out once; that is fine). | none | 10 min |
| R4 | **Approval checks one key; the flow requires two.** `data-flows.md` §6 says approving needs `admin.users.manage` **and** `admin.users.assign_role` (approval sets a role). `approveUserAction` checks only `admin.users.manage`. Both keys are locked to Admin today, so this is not exploitable now, but the code should match the rule so the grid (Slice 10) cannot drift from it. | `src/app/(app)/admin/users/actions.ts`; `src/server/policies/authorize.ts` | Let `authorize()` accept a list of keys that must all be held (or check the second key after the first). `rejectUserAction` stays on `admin.users.manage` only. | `evaluate-authorization.test.ts`: a role holding only `admin.users.manage` cannot approve | 0.5 h |
| R5 | **Reserved usernames.** Anyone can take `admin`, `administrator`, `support`, `system`, `faculty`, `teacher`, `campusflow` and similar. Usernames are shown in rosters and used for team and co-teacher invitations, so these invite impersonation. | `create-auth.ts`, `username({...})` | Add a reserved list in `src/config/limits.ts` and refuse those names (case-insensitive) using the username plugin's validator option. **[Verify]** the option name (`usernameValidator` in current docs). Show the usual "That username can't be used" message. | Welcome with `Admin` or `support` is refused with the generic message | 0.5 h |
| R6 | **Line endings make the diff unreadable.** `docs/CLAUDE.md` and `docs/decisions.md` now have Windows (CRLF) line endings, so Git shows every line as changed (154 and 342 lines) when only a few lines really changed. There is no `.gitattributes`, so this will keep happening. | repository root | Add `.gitattributes` with `* text=auto eol=lf` and `*.png binary`, `*.ico binary`. **Owner, once, before committing:** `git add --renormalize .` | none | 10 min |

### 2.2 Documents that must follow the code

The code is right in each case; the documents are out of date.

| ID | Document says | Code does (correct) | Change |
|---|---|---|---|
| D1 | `permissions.md` §7 item 3 and `folder-structure.md` §3 (`proxy.ts` line): the proxy redirects users without a username and pending users | `proxy.ts` only checks for a session cookie; `gate()` in `access-gate.ts`, called by every page, does username and status routing from the database | Update both documents: the proxy redirects signed-out visitors only; `gate()` does the rest |
| D2 | `permissions.md` §2 step 2: rejected and deactivated users "may only sign out" | They see `/pending` with their status message and a sign-out button | Change the wording to "see only `/pending` (status message and sign-out)" |
| D3 | `decisions.md` §17: sign-up sends the person to `/sign-in?created=1`, which shows "Account created" | Sign-up shows a toast and goes to `/sign-in` (no query parameter) | Correct the note |
| D4 | `mvp-scope.md` §11: **deactivate and reactivate** (with session deletion), **role change** (with the blockers in `permissions.md` §6 rule 8) and **reset a rejected account** are in the design but in no slice. This is an Opus planning gap | Not built (correctly, for Slice 1) | Add them to the Slice 10 row ("Admin completion") |
| D5 | `folder-structure.md` §3 and §4: every domain has its Zod schemas in `src/server/<domain>/schemas.ts` | Schemas used by browser forms are in `src/lib/schemas/`, because browser code cannot import `src/server` | Add one line: schemas shared with browser forms live in `src/lib/schemas/`; server-only schemas stay in the domain folder |
| D6 | `decisions.md` sections run 14, 16, 17, then 15 ("Still open") | | Move "Still open" to the end and renumber it 18, so the open list is always last |

### 2.3 Nice to have, or for a later slice

| ID | Finding | Change | When |
|---|---|---|---|
| N1 | Better Auth endpoints the MVP does not use are still on: `/link-social`, `/unlink-account`, `/list-accounts` | Add them to `disabledPaths` (fewer ways in; no feature needs them) | Now, 5 min |
| N2 | The sign-up attack tests wrap their checks in `if (row)`, so a case passes without checking anything when Better Auth refuses the request | Assert explicitly: either the response is 400 or above and no row exists, or the row has the defaults | Now, 15 min |
| N3 | Rate limits use the client IP. Behind a Cloudflare Tunnel, the `X-Forwarded-For` header may be partly client-controlled. **[Unsure]** which entry Better Auth reads | For the friends test, set Better Auth's IP header to `cf-connecting-ip` and confirm the 5-per-minute limits still trigger | Slice 12 |
| N4 | Better Auth refuses requests whose origin differs from `BETTER_AUTH_URL`. Opening the app at `http://127.0.0.1:3000` while the URL says `localhost` breaks sign-in with an "invalid origin" error | One line in `README.md`: open the app at exactly the `BETTER_AUTH_URL` address | Now, 2 min |
| N5 | No Playwright flow yet. The manual browser run of 24 Oct is exactly the first required flow | Write it in Slice 2: sign up, welcome, pending, approve as Admin, student reaches the dashboard, student gets "not found" on `/admin/users` | Slice 2 |
| N6 | The Admin user list stops at 200 rows silently | Show "Showing the newest 200" when the limit is hit | Later |
| N7 | `approveUser` and `rejectUser` load the whole user row inside the transaction | Select only the columns they use (matches the "select only what you need" rule; no data leaves the server today) | Now, 5 min |

---

## 3. Order of work for Sonnet

1. R6 (`.gitattributes`). Then the owner runs `git add --renormalize .` so the real diff becomes visible.
2. R1, R2, R5 in `create-auth.ts`, with their tests.
3. R4 with its test.
4. R3 (`.env.example` wording).
5. N1, N2, N4, N7 if the owner approves them.
6. D1 to D6 in the documents.
7. Run `typecheck`, `lint`, `test`, `npm audit`; report the changed files. The owner commits.

---

## 4. Functional walk-through (all consistent with the documents unless noted)

| Flow | Result |
|---|---|
| Sign-up with email: account pending, nobody signed in, sent to sign-in | Works; existing email gives the same answer (no enumeration) |
| Sign-in: home sends a user without a username to `/welcome` | Works |
| Welcome: username stored lower case, typed form kept, requested role saved, cannot be done twice | Works; one generic message for every refusal |
| Pending page: pending, rejected (with reason) and deactivated messages, sign-out | Works (see D2) |
| Google: new account goes to `/welcome`; same email as a password account gives "sign in with your email and password" | Built; **not tested end to end** (needs the owner's Google client). Test before merging |
| `admin:promote`: activates and audits; refuses a second time | Works |
| Admin users page: pending filter, email-verified badge, requested role pre-filled, unverified email needs the confirmation tick (enforced on the server too), own account and no-username rows not actionable | Works |
| Reject with an optional reason, shown to the person | Works |
| Student opens `/admin/users`: not found | Works |
| Settings: time zone (validated against real zone names), password change (signs out other devices), Google-only accounts told there is no password | Works |
| Sign-out from the app shell and from `/pending` | Works |

Slice 1 also built parts of Slice 2 (permission keys, `seed:base`, steps 1 to 3 of `authorize()`), as recorded in `decisions.md` §17. That is fine; Slice 2 adds steps 4 and 5, the triggers, the read-only grid and the table-driven harness.

---

## 5. Owner checklist before committing

1. Delete three leftover files from this review (they are inside `.git`, so Git ignores them, but remove them anyway): `.git\stale-index-lock-opus-review`, `.git\stale-index-lock-opus-review-2`, `.git\opus-review-src.tgz.tmp`. Read-only Git commands from the review environment left lock files behind; they were moved aside so your Git keeps working.
2. Run `npm run test` and `npm audit`; check the last GitHub Actions run.
3. Generate a new `BETTER_AUTH_SECRET` (R3).
4. Try Google sign-in once with your Google client set up.
5. After Sonnet's fixes: `git add --renormalize .`, then commit on `dev-Arjun`.
6. This was the Slice 1 security review from `CLAUDE.md`. The next one is due at the end of Slice 2.
