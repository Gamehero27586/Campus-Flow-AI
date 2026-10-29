# CampusFlow AI: decisions log

Version 1.0, 24 Oct 2026. Rewritten after the Opus review of the Phase 0 to 2 pack. **When any document disagrees with this file, this file wins.** When two documents disagree and this file is silent, stop and ask the owner; do not guess.

## 1. Which document is current

| Topic | Current document |
|---|---|
| Goals, scope, user stories, build slices | `mvp-scope.md` (v3) |
| Tables, columns, constraints | `data-model.md` (v0.5) and `er-diagram.png` / `.svg` (v0.5) |
| Roles, permission keys, relationship rules, Admin | `permissions.md` (v0.4) |
| Folders, conventions, routes, scripts | `folder-structure.md` (v0.4) |
| Business flows, status rules, **metric definitions** | `data-flows.md` (v0.4). The only place metrics are defined |
| Colours and UI tokens | `color-palette.md` (v2) |
| Working rules for Claude | `CLAUDE.md` (copy to the repository root in Slice 0) |
| Screens | The wireframe canvas (link kept by the owner). Where it disagrees with the documents, the documents win |
| Schedule | `campusflow_plan-v3.xlsx` in the `Campus-Flow AI Workspace` folder (re-baselined 24 Oct 2026; the older `campusflow_plan.xlsx` is history) |

Everything in `docs/archive/` is history, including the Opus review (`archive/opus-review.md`). **Do not build from it.** Section 14 says which review items were applied.

## 2. Stack and tooling

- Next.js 16 (App Router, `src/`, TypeScript strict), PostgreSQL, Drizzle ORM with the **`pg` (node-postgres) driver** (never `neon-http`, which has no interactive transactions), Better Auth (email and password, Google), Tailwind and shadcn/ui, Zod, react-hook-form, Vitest, Playwright, ESLint, Prettier.
- Package manager **npm**. The owner works on Windows with PowerShell.
- Database: **Neon** (free tier) for development and the friends test; a **local PostgreSQL** copy is kept as the demo fallback. Migrations with `drizzle-kit generate` and `migrate`, committed, never edited after being applied.
- Tests: Vitest for unit, policy and metric tests; Playwright for 3 end-to-end flows. Test database decided in Slice 0 (first candidate: PGlite; check that the metric SQL's time zone functions work).
- CI: a GitHub Actions workflow runs `typecheck`, `lint` and `test` on every push.
- Local AI: Llama 3.2 3B through Ollama on the owner's laptop. No third-party AI API. No fine-tuning.
- Files: **local disk only** in the MVP, behind a storage interface (`upload`, `stream`, `delete`). Cloudinary is a later option, not part of the MVP. Allowed types PDF, JPG, PNG; cap `MAX_FILE_SIZE_BYTES` = 10 MB; at most 20 files per assignment or submission.
- No email is sent in the MVP (no verification, no reset emails). See section 3.

## 3. Accounts, roles and permissions

- Sign-up with email and password or Google. Every new account is `pending` and sees only the welcome and waiting screens.
- **Welcome screen (once):** every user chooses a **username** (3 to 20 characters: letters, numbers, dot, underscore; stored lower case; unique) and optionally a **requested role** (Student or Faculty). Until a username is set, the user is sent to `/welcome` before anything else. **Usernames cannot be changed after they are set** (Better Auth `immutableUsername`).
- The Admin approves (choosing the role, pre-filled with the request) or rejects. Admin is never offered at sign-up.
- **First admin:** the owner signs up normally, then runs `npm run admin:promote -- <email>` once. It refuses if an active admin exists and writes an audit row. **No runtime code ever promotes anyone by email.**
- **Email ownership is not proven in the MVP.** The approval page shows whether the email is verified (Google sets it) and the Admin checks with the person before approving an unverified account. Google logins never merge silently into an existing email-and-password account (`accountLinking.disableImplicitLinking: true`).
- **Forgotten password:** the Admin creates a one-time reset link from the Users page (expires after 1 hour, audited) and passes it on. A rejected account can be reset to pending by the Admin.
- **App-owned user fields** (`status`, `role_id`, `approved_by`, `approved_at`, `rejection_reason`, `is_seed`, `requested_role`, `timezone`) are Better Auth `additionalFields` with **`input: false`**. They are written only by our own server code. A test proves `update-user` cannot change them.
- Three fixed roles: Student, Faculty, Admin. **23 permission keys**, each with a list of **eligible roles**. The Admin grid can only tick eligible cells; four Admin keys are locked. Details in `permissions.md` §3.
- Permissions are read per request, never stored in the session. Better Auth `session.cookieCache` stays **off**. Deactivating a user deletes their session rows in the same transaction.
- **Role changes are refused** while the user is faculty of an active class or a member of an active class or team. Transfer or remove those first.

## 4. Tasks

- One `tasks` table with context personal, assignment or team. Subtasks are one level deep and copy the parent's context, assignee, `assignment_id` and `team_id`.
- One assignment task per student: unique (assignment_id, assignee_id) **for top-level tasks only** (partial index).
- Status `todo`, `in_progress`, `done` (label "To Do"). `completed_at` is set exactly when status is done (CHECK).
- When a task is completed without ever being started, the app asks once "When did you start?" (optional); the answer sets `started_at`. "Start" is the obvious first button on every task card.
- Assignment tasks cannot be marked done by hand or reopened by the student. The first submission completes the task **and any open subtasks**. Faculty allow another submission with `resubmission_until`.
- Only the **assignee** changes a team task's status or moves its deadline. Any active member can edit, reassign or delete it.
- Lateness is **calculated**, never stored.
- Soft delete records a `deleted_reason`: `user_deleted`, `recipient_removed` or `assignment_cancelled`.

## 5. Classes and assignments

- A class has one owner and optional **co-teachers** (in the MVP, Slice 6). The owner adds a co-teacher by exact username or email of an active Faculty user.
- Joining by code creates a **request**; the teacher approves or declines. Per-class setting `requires_approval` (default on). Declined or removed students stay outside until the teacher reconsiders. A student **asks to leave** and the teacher decides.
- Assignments go to all active members or selected members. Later joiners do not receive earlier assignments automatically; faculty can add them.
- Closing uses one column, `closes_at`. "Close now" sets it to the current time.
- `max_marks` is locked once any grade exists. Attachments can be added and removed until the first submission, then only added.
- An assignment can be cancelled only while it has no submissions. Once it has submissions, faculty close it instead.

## 6. Submissions and files

- Each submission version is kept; the latest is graded; the first submission time decides on-time. One grade per task.
- A file has exactly one parent: `files.assignment_id` or `files.submission_id` (no link tables).
- Uploads go to `POST /api/uploads` as the raw file body, read as a stream with a byte counter and a content-signature check. The upload and download routes are excluded from the `proxy.ts` matcher (Next.js truncates bodies over 10 MB there).
- Downloads only through `/api/files/[fileId]` after the parent's policy passes. PDFs and images open inline inside a CSP sandbox (if a browser's PDF viewer fails under the sandbox, PDFs are downloaded instead); the file name in the header is encoded.

## 7. Teams

- Teams are independent of classes. The creator invites by exact email or username; the invitee accepts or declines. Only **active Students** can be invited. The reply is the same whether or not the user exists.
- Removed members' tasks stay assigned for history, are shown as "former member", and any active member can reassign them.
- Team join codes are a later feature.

## 8. Metrics and Growth Tracker

- Timeframes: day, week (Monday to Sunday), month, in the user's time zone. The word "period" is not used.
- Counted: top-level tasks in all three contexts assigned to the user. Deleted tasks count only when `deleted_reason = user_deleted` and they were already completed or past their deadline when deleted. Assignment tasks from a class the student left or was removed from count only if they were due before that.
- For the **current** timeframe, the due set is tasks due between its start and now.
- Consistency is **monthly only**. A week belongs to the month that contains its Thursday. Denominator: weeks with at least one due task; at least 2 such weeks are needed.
- Trend minimum: **5** completed tasks for a week, **10** for a month, in both the current and the previous timeframe. The weekly AI summary needs at least 3 due tasks. These numbers live in `src/config/`.
- Day view shows counts only.
- All definitions: `data-flows.md` §7.

## 9. AI

- Breakdown: JSON schema through Ollama `format`, Zod validation, one retry, then a clear fallback. The student edits before anything is saved. Code assigns dates.
- **History-only estimate hint:** the median active time of the user's last completed tasks in that category (at least 3). There is no separate AI estimate call; AI minutes appear only on breakdown subtasks.
- **Weekly summary is template-first:** code writes every sentence that contains a number. The model writes at most three short suggestions, and any output containing a digit is rejected.
- All AI text is shown as plain text. The model is kept loaded (`keep_alive`) and warmed up when the app starts.

## 10. Visibility tiers and Admin

- **Tier 1, personal** (personal tasks, subtasks of assignment tasks, personal tracker, AI history): owner only. Never Faculty, never Admin.
- **Tier 2, academic** (classes, rosters, assignments, parent assignment tasks, submissions, files, grades, class trackers): class Faculty and the student concerned. **Admin may view them read-only.**
- **Tier 3, teams:** active members. Admin may view read-only.
- **Admin writes are limited** to: account approval and status, roles, the permission grid, reset links, **transfer class ownership** and **transfer team creator**. Admin cannot edit grades, assignments, submissions, rosters or team tasks.
- Every Admin view of a class or team page shows a "Viewing as admin" banner. Opening a submission file as Admin is written to the audit log.

## 11. UI

- Colours, tokens and contrast rules: `color-palette.md` v3. Light and dark themes (the person chooses Light, Dark or System; saved in a cookie). Components use theme tokens, never raw hex values.

## 12. Hosting, demo and friends test

- The app, the database connection and Ollama run on the owner's laptop. For the friends test (1 to 2 weeks) the laptop is reachable through a free tunnel (for example Cloudflare Tunnel) while it is switched on. Google OAuth redirect URLs must include the tunnel address.
- The demo and the friends test run a production build (`npm run build` then `npm start`), never `npm run dev` (Better Auth rate limits only work in production mode).
- **Go-live checklist.** The day the live Neon project is created, save its string as `DATABASE_URL_LIVE` in `.env.local`: the guard on the destructive dev scripts protects the live database only if its string is saved. When the live database becomes the working one, remove `DEV_DB_RESET_ALLOWED` from the environment (see §18). The friends test uses the live database, never the test one.
- The night before a demo: `pg_dump` from Neon into the local PostgreSQL and rehearse with the network off.

## 13. Build plan

Slices and hours are in `mvp-scope.md` §11. Two checkpoints:
- **Checkpoint A** (after Slice 5): a student can plan tasks, break them down with AI and see their Growth Tracker.
- **Checkpoint B** (after Slice 8, the first university demo): the full faculty-to-student loop as well.

## 14. Outcome of the Opus review (24 Oct 2026)

| Review IDs | Outcome |
|---|---|
| B1 to B6 | Applied (B1 by `input: false`) |
| S1 | Applied with option (b): no email in the MVP |
| S2 to S16 | Applied. S4: role changes are refused while relationships exist |
| C1 to C8 | Applied |
| G1 to G19 | Applied. G5 thresholds 5, 10 and 3. G7 Admin reset links. G13 laptop plus tunnel |
| P2 (narrow Admin override) | Applied |
| P3 (eligible roles, 23 keys) | Applied |
| P5 (no Cloudinary), P6 (one parent per file, single `closes_at`), P7 (template summary) | Applied |
| P1 (simplify teams), P4 (simplify join and leave), P8 (trim metrics) | **Rejected by the owner.** Teams, join requests, leave requests and all metrics stay as designed |
| P9 (Google later), P10 (co-teachers later) | **Rejected by the owner.** Both stay in the early slices |
| D1 to D3, D5, D6 | Applied in `color-palette.md` v2 |
| D4 (coral versus teal hierarchy) | Open, owner's design choice (section 19) |
| New slice order and two checkpoints | Applied |

Choices Opus made where the owner had not answered; the owner may change any of them: `input: false` instead of a separate profile table; refusing role changes; immutable usernames; the 5, 10 and 3 thresholds; faculty being **eligible** (off by default) for personal tasks, the personal tracker and AI.

## 16. Slice 0 outcomes (24 Oct 2026)

- **Neon: database only.** Neon Auth is not used (Better Auth runs inside the app so the hardening rules in `permissions.md` and the same-transaction audit writes are under our control, and it must work offline against local Postgres). Neon has no role in file storage; files stay on local disk.
- **Next.js 16.4.3 template defaults changed:** `cacheComponents` and `partialPrefetching` are **off**. Every page reads the signed-in user, so rendering is per request; the older caching model is simpler to explain and review. `use cache` is not used. Revisit only if a page needs it.
- **Tailwind v4 setup** is the one `create-next-app` generated (`@tailwindcss/turbopack` rule in `next.config.ts`). Theme tokens use the hex values from `color-palette.md` directly (shadcn writes OKLCH by default, but hex works in the same variables). Dark mode block removed. Variable names are unchanged. `chart-4` and `chart-5` removed (three series only).
- **Node:** `engines.node >= 24`; `@types/node` ^24 (Vitest 5 needs 22 or newer). Owner runs Node 26.7.
- **Test database: PGlite**, checked on 24 Oct 2026: `AT TIME ZONE`, `date_trunc('week' ...)` in a zone, daylight-saving edges, `gen_random_uuid()`, CHECK constraints and partial unique indexes all behave like Postgres. It is added as a dev dependency in the first slice that has database tests (Slice 2 or 3). Triggers (append-only tables) must be re-checked on PGlite then; if one fails, use a local Postgres test database.
- **Migrations:** `drizzle/0000_baseline.sql` is an intentionally empty baseline, applied to Neon. `drizzle.config.ts` uses `DATABASE_URL_UNPOOLED` when set, otherwise `DATABASE_URL`. `pg` warns that `sslmode=require` is treated as `verify-full`; this is the safe behaviour and needs no change.
- **`npm audit`:** 4 moderate findings, all one old `esbuild` copy inside `drizzle-kit` (dev-server request issue, dev tool only, never shipped). `npm audit fix --force` would downgrade `drizzle-kit` to 0.18, so it is not applied. CI fails only on high or critical. Re-check each slice; drop this note when drizzle-kit updates.
- **Git:** from the end of Slice 0 the owner does all committing, on the branch `dev-Arjun`, and merges to `main` after review. Claude never commits, branches, tags or pushes (Claude did the Slice 0 commit, merge and tag once, at the owner's request).
- **Scripts** `seed:base`, `seed:demo`, `admin:promote`, `eval:ai`, `files:cleanup` are added with the slice that creates them, not before.
- **Not yet done from the Slice 0 checklist:** Dependabot alerts on in GitHub (a repository setting the owner switches on), a local PostgreSQL database (owner is installing it later), `npx playwright install` (needed when the first e2e flow is written).

## 17. Slice 1 notes (built and reviewed 24 Oct 2026)

**Better Auth 1.7.12, checked against its current docs and source:**
- Confirmed names: `user.additionalFields` with `input: false`, `session.cookieCache.enabled: false`, `account.accountLinking.disableImplicitLinking`, `advanced.database.generateId: "uuid"`, username plugin `immutableUsername`, `minUsernameLength`, `maxUsernameLength`, top-level `disabledPaths`. The schema CLI is `npx auth@latest generate` (not `@better-auth/cli`); the tables here were written by hand in Drizzle instead and are proven by tests that run the real migrations.
- **Better Auth drops or refuses app-owned fields at sign-up and `update-user`.** It does not guard `displayUsername`: any user could set it to "Admin". Our `update.before` hook therefore requires the display username to equal the username apart from letter case. `immutableUsername` only fires when a request contains `username`.
- **The welcome action must send `username` and `displayUsername` together** (the typed form is kept for display; updates with only `username` leave `display_username` empty).
- Disabled endpoints: `/is-username-available`, `/sign-in/username`, `/request-password-reset`, `/forget-password`, `/send-verification-email`, `/verify-email`, `/link-social`, `/unlink-account`, `/list-accounts` (no MVP feature uses them; each is tested as 404). There is no Better Auth call that returns a reset link without sending email, so Admin reset links (Slice 10) need their own design around the `sendResetPassword` callback.
- Rate limits (sign-in and sign-up 5 per minute) run only in production mode.

**Structure:** `createAuth(db, settings)` in `src/server/auth/create-auth.ts` builds the auth object so tests can pass an in-memory PGlite database; `better-auth.ts` builds the real one. Files in `src/server/db/schema/` import each other with relative paths and do not import `server-only`, because `drizzle-kit` loads them outside Next.js.

**Choices made while building 1b to 1e (the owner may change any of them):**
- **`proxy.ts` only redirects signed-out visitors** (by session cookie). The docs also listed "no username" and "pending" redirects there, but the proxy cannot read the database, and a cookie alone proves nothing. The username and approval routing is `gate()` in `src/server/auth/access-gate.ts`, called by every page, and tested as a table. This is stricter, not looser.
- **Rejected and deactivated accounts see `/pending`** (the page with the message and the sign-out button). A sign-out button needs a page to sit on, so `permissions.md` §2 now says they see only `/pending` (status message and sign-out).
- **Form schemas live in `src/lib/schemas/`**, not in `src/server/<domain>/schemas.ts`, because the sign-in, sign-up and welcome forms run in the browser and `src/server` cannot be imported there. Server code imports the same schemas from `src/lib`.
- **Approval offers Student and Faculty only.** Making someone Admin is `admin.users.assign_role` (Slice 10). An account that has not chosen a username cannot be approved. An unverified email needs the Admin to tick a confirmation, and the server enforces it as well as the form.
- **Anyone can sign up, and every account starts pending** (Better Auth's `input: false`, plus the create hook). Google sign-in appears only when both `GOOGLE_*` variables are set.
- **`seed:base` gives defaults only to a key that has no grants**, so Admin grid edits survive a re-run. Consequence: if an Admin removes every grant from a key, re-running the seed restores the defaults.
- **Scripts run with `tsx --conditions=react-server`** so `server-only` and React's `cache` behave as they do in Next.js. The package is CommonJS, so scripts use a `main()` function instead of top-level `await`.
- **`@hookform/resolvers` is pinned to 5.x** (6.x had an unresolvable optional peer dependency with Zod 4).
- **Sign-up does not sign anyone in** (`emailAndPassword.autoSignIn: false`, owner's request). The sign-up page shows a toast and sends the person to `/sign-in`, they sign in with the new email and password, and the home page then sends them to `/welcome` for the username. Google sign-in has no separate sign-up step: a new Google account is signed in and goes straight to `/welcome`.
- **Toasts (sonner, wrapped in `src/components/ui/sonner.tsx`, always light, top centre)** report the result of sign-in ("Signed in."), sign-up and Google errors. The wording lives in `src/lib/auth-messages.ts` and is unit-tested. Field mistakes (bad email, short password) stay inline under the field. Other forms (welcome, settings, Admin) still show their messages inline.
- **Sign-up with an email that already has an account looks successful.** With `autoSignIn: false`, Better Auth deliberately returns a generic success and creates nothing, so nobody can discover which emails are registered. The sign-up toast is worded to be true in both cases ("If this email already had an account, use its existing password").
- **Font: Poppins** (owner's request), loaded with `next/font/google` at weights 400 to 700. The shadcn template's `--font-sans: var(--font-sans)` pointed at itself, so no font was ever applied; it now points at `--font-poppins`.
- **Dark mode (design pass, 25 Oct 2026, owner's request) replaces the light-only rule.** `@custom-variant dark (&:is(.dark *))` stays in `globals.css`: `dark:` styles apply only inside the `dark` class that our cookie-driven theme sets, never because of the operating system alone. The owner's dark palette and the colours derived for it are in `color-palette.md` §6, and `tests/unit/theme-contrast.test.ts` checks every text and control pair in both themes from the real CSS.
- **Theme choice is a cookie, not a database column** (owner's choice): Light, Dark or System (default System), per browser, so it also works on the sign-in page. A `beforeInteractive` script in the root layout sets the class before first paint; the layout reads the cookie so an explicit Dark renders dark on the server. The root layout therefore reads `cookies()`, which makes every page dynamic. They already were, because each reads the session.
- **`text-primary` became `text-brand`** for headings, links and selected filters. `--primary` is the button colour (`#0D4F4C` in both themes), which is unreadable as text on the dark background; `--brand` is that teal in light mode and a lighter teal (`#5CC4B8`) in dark mode.
- **Layout changes:** sign-in and sign-up are split (logo panel left, form right; on a phone a small logo above the form); welcome and pending stay centred cards with a small logo. The sidebar is 18rem (288 px) and sticky; the header bar is gone. The name and role badge at the bottom of the sidebar open an account menu (theme, Settings link, Sign out); Settings is no longer in the main menu but the page remains and also has an Appearance section. Role badge colours: Admin amber, Faculty teal-soft, Student muted; the role is always written out. The same badge is used in the sidebar and in the Admin Users table (replacing the plain role word). The account menu is 20rem wide so the three-way theme switch fits inside it (measured: every choice inside the box, none clipped).
- **Proxy matcher now excludes static files** (`brand/`, `icon.png` and any `.png .jpg .svg .webp .ico .woff` file). Without it a signed-out visitor's logo requests were redirected to `/sign-in` and the sign-in page showed a broken image. `tests/unit/proxy-matcher.test.ts` pins it. A production server only serves `public/` files that existed when it started, so restart after adding files.
- **Logo is vector (owner's request, 25 Oct 2026).** The mark was traced from the owner's artwork with a colour tracer run in a scratch folder (not a project dependency): shapes are snapped to a clean flat palette, edge-blend colours are pruned, and shapes overlap by a hairline so there are no seams. The wordmark and tagline are live Poppins text beside it. Files: `public/brand/mark-light.svg`, `public/brand/mark-dark.svg` and `src/app/icon.svg`. Deleted: the five Next.js template SVGs, the owner's two redrawn SVGs, and my PNG crops. The original artwork moved from `public/` to `design/brand-source/`, so it is no longer served and is not lost (it was never committed). Details in `color-palette.md` §6.
- **Reapprove (owner's request, 25 Oct 2026).** A rejected account has two buttons on the Admin Users page: **Reapprove** (choose a role; same email-ownership confirmation as approving; needs both `admin.users.manage` and `admin.users.assign_role`; the audit row `user.reapproved` keeps the reason it clears) and **Move back to pending** (`permissions.md` §8 "reset a rejected account"; needs only `admin.users.manage`; audit `user.reset_to_pending`). Approving and reapproving share one code path that differs only in the starting status, so they cannot drift apart. Neither works on your own account.
- **First Admin:** the owner's account was promoted with `npm run admin:promote` after a manual `role_id` edit left the status `pending`. Both the role and an `active` status are needed; the script sets both and writes the audit row.
- **Not tested here:** the Google sign-in round trip (needs the owner's Google account) and the friends-test tunnel. Everything else ran end to end in a browser on 24 Oct 2026: sign-up, welcome, pending, `admin:promote`, approval with the unverified-email confirmation, student sign-in, and "not found" on the Admin page for a student. The two test accounts were deleted afterwards.

**Fixes from the Slice 1 Opus review** (`docs/reviews/slice-1-opus-review.md`, all applied 24 Oct 2026):
- **N1 (revised):** `/link-social` is enabled again for Connect Google (see below); `/unlink-account` and `/list-accounts` stay disabled.
- **R1** `name` is trimmed and limited to 100 characters in Better Auth's create and update hooks, not only in the form (`NAME_MAX_LENGTH`). A long Google profile name is shortened, not refused, so it cannot block a sign-in.
- **R2** Users cannot set `image`: `update-user` refuses it, and the create hook keeps an image only for Google sign-ins. Better Auth's `update-user` handler passes `name` and `image` as keys with value `undefined` when they were not sent, so the hooks test the value, not the key.
- **R3** The secret-generation command in `.env.example` is now Node's `crypto.randomBytes`. (The secret already in `.env.local` was made with .NET's cryptographic generator, so it did not need replacing.)
- **R4** Approving needs both `admin.users.manage` and `admin.users.assign_role`. `authorize()` takes one key or a list that must all be held. Rejecting needs only the first.
- **R5** Reserved usernames (`RESERVED_USERNAMES` in `src/config/limits.ts`: admin, support, system, faculty, campusflow and more) are refused by the form and by the username plugin's `usernameValidator`. Dots and underscores are ignored when comparing, so `ad.min` is refused too. The message is the same generic one.
- **R6** `.gitattributes` sets LF line endings so Git diffs show only real changes. The owner runs `git add --renormalize .` once.
- **N1** `/link-social`, `/unlink-account` and `/list-accounts` are disabled. **N2** The sign-up attack tests assert in both outcomes. **N4** README says to open the app at exactly `BETTER_AUTH_URL`. **N7** Approve and reject select only the columns they use.
- **Planning gap closed (review D4):** deactivate and reactivate, role change and reset-a-rejected-account were designed but in no slice. They are now in the Slice 10 row of `mvp-scope.md` §11, whose estimate rises from 12 to 20 hours to 18 to 28; the total build estimate rises by about 6 to 8 hours (re-estimate after Slice 3).
- **Connect Google (added after the review, owner's request):** a Google sign-in for an email that already has a password account is still refused (`account_not_linked`), because the email was never verified and a silent merge would let whoever registered the email first keep a password into the account. Instead the person signs in with their password and presses **Connect Google** in Settings (`/link-social` is therefore enabled; `/unlink-account` and `/list-accounts` stay off). Better Auth's explicit-link path skips the implicit-linking block when a signed-in user is linking (checked in `oauth2/link-account.mjs`), and requires the Google email to match the account's email. Settings shows "Sign-in methods": password set or not, Google connected or not. The link round trip itself is **not tested here** (needs the owner's Google account); `hasGoogleLogin`, the messages and the "needs a session" check are tested.
- **Google always shows its account picker** (`prompt: "select_account"` on the Google provider), for sign-in and for Connect Google. Found when the owner's first Connect Google linked at once because the browser was already signed in to that Google account: safe (the email must match), but risky on a shared computer. A test checks the sign-in URL carries `prompt=select_account`.
- **Deferred (review N3, N5, N6):** the client-IP header behind the tunnel (Slice 12), the first Playwright flow (Slice 2) and the Admin list's 200-row notice (later).

**Slice order overlap (approved by the owner):** Slice 1 also builds the permission keys, `seed:base` and steps 1 to 3 of `authorize()` (signed in, account active, permission key). Slice 2 adds steps 4 and 5, the audit triggers, the read-only grid and the table-driven harness.

## 18. Slice 2 notes (built and reviewed 25 Oct 2026)

**Two databases (owner's decision).** The current Neon project is the **test** database: `DATABASE_URL` in `.env.local` points at it while developing, and its data may be wiped. The **live** database is a separate Neon project; its string is kept in `.env.local` as `DATABASE_URL_LIVE`, empty until created. The app never reads `DATABASE_URL_LIVE`. Going live later means copying that string into `DATABASE_URL`. The destructive dev script (`npm run db:reset`) runs only when `DEV_DB_RESET_ALLOWED=yes` is set in `.env.local` and refuse when `DATABASE_URL` points at the same Neon project as `DATABASE_URL_LIVE` (pooled and direct strings both counted). Tested in `tests/unit/test-database-guard.test.ts`. Remove `DEV_DB_RESET_ALLOWED` from `.env.local` when the live database becomes the working one.

**Test accounts share one password, and no password is written anywhere in the repository (owner's rule, 25 Oct 2026).** My first version put the password in a script constant and in this document; the owner pointed out that Git history would keep it forever, and it was removed before anything was committed. Now: on the test database every account's password **hash** was made identical with one SQL statement that copies the Admin account's hash to the others, so the password itself never appears in a file. After a `npm run db:reset`, or whenever new accounts should share it, run the same statement in the Neon console (replace the email with the Admin account's): `UPDATE account SET password = (SELECT a.password FROM account a JOIN users u ON u.id = a.user_id WHERE u.email = 'admin@example.com' AND a.provider_id = 'credential') WHERE provider_id = 'credential';`. The end-to-end flow reads the Admin's email and password from `.env.local` (`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, git-ignored) and gives every new test student a random password. Because the test database's Admin has a simple, shared password, `src/env.ts` refuses to start when `DEV_DB_RESET_ALLOWED=yes` (the marker of the test database) and `BETTER_AUTH_URL` is not `localhost` or `127.0.0.1`, so the test database cannot be served on a public address by accident (tested in `tests/unit/env.test.ts`). Live accounts get real passwords.

**`audit_logs` is append-only** (migration `0002_audit_append_only.sql`): one trigger function refuses UPDATE, DELETE and TRUNCATE on the table. Checked on PGlite and on Neon (update, delete and truncate all refused, existing rows intact). It stops application bugs and stray queries; a database owner can still drop the trigger on purpose. The same function is reused for `task_events` in Slice 3. Consequences: an account that has ever acted (an audit row points at it) can never be deleted, so the earlier habit of making throwaway accounts and deleting them is over; tests use a fresh in-memory database per test or read only the audit rows about their own accounts; and a test database that has collected audited actions is reset with `npm run db:reset` (drops the `public` and `drizzle` schemas, re-applies every migration, re-seeds roles and permissions; afterwards sign up, `npm run admin:promote -- <email>`, then copy the shared password hash between accounts with the SQL below).

**Audit action names** are one typed list, `src/server/audit/audit-actions.ts` (named so because `actions.ts` files in this project are server actions). `writeAudit` accepts only names from it.

**Steps 4 and 5 of the pipeline** exist as a framework; the real rules arrive with the tables they need (tasks in Slice 3, classes in 6, assignments and files in 7, teams in 11). `src/server/policies/`: `decision.ts` (a refusal is `not_found`, `not_allowed` or `state`, and `not_found` is what hides a record from someone who may not see it), `evaluate-record.ts` (runs the five steps in order; **the record is loaded only after steps 1 to 3 pass**, so a refused request never touches it; a missing record and a hidden record give the identical answer), `admin-access.ts` (Admin reads academic and team records through `admin.override`, never personal ones, and may write only the two transfers), and `authorizeRecord()` in `authorize.ts`. A domain writes only two small functions, `relationship` and `state`, in its own `policy.ts`.

**Read-only permission grid** at `/admin/roles` (needs `admin.roles.edit_permissions`; "Roles" in the Admin menu). Every key against every role with words and icons: granted, off but can be turned on, not possible, locked. It reports problems in plain language when the database disagrees with the rules (a grant to an ineligible role, a locked key missing from Admin, a key the code does not know). Editing is Slice 10.

**Permission tests.** Expected results are written out by hand, never computed from the code: `default-grants.test.ts` copies the 23 keys, default roles, eligible roles and locked keys from `permissions.md` §3; `pipeline-table.test.ts` is acting user type x action x result (all eight user types); `record-pipeline.test.ts`, `admin-access.test.ts` and the grid tests cover the rest. `readPermissionKeys` (uncached, `read-permissions.ts`) lets a test prove that a permission removed from a role is refused on the very next request and that a deactivated account with an open session is refused at once; the per-request cached wrapper is `load-permissions.ts`. The cases that need tables not built yet are listed as `it.todo` in `tests/unit/permissions/later-slices.test.ts`, grouped by the slice that must write them.

**First Playwright flow** (`tests/e2e/signup-approval.spec.ts`): sign up, sign in, choose a username, wait on the pending page (the app and Admin pages bounce a pending account), the Admin approves from the Users page, then the student reaches the dashboard, gets "not found" on the Admin pages and sees no Admin menu links. It runs on a production build on port 3100 (`npm run test:e2e` builds first), signs in as the owner's Admin account with the test password, and leaves one approved `@example.test` student and one audit row on the test database. The sign-in and sign-up limit is 5 per minute, so wait a minute between runs. Building while `npm run dev` is running can leave the dev server with a stale `.next` folder: restart it. The Chromium browser for Playwright is installed (about 150 MB, in the user profile, not the repository). Two more flows are still to write (CLAUDE.md asks for three).

**Fixes from the Slice 2 Opus review** (`docs/reviews/slice-2-opus-review.md`, applied 25 Oct 2026):
- **T1 (revised by the owner):** no password and no personal email in the repository, and not even a password script. The test accounts' shared password is made by the SQL statement above; `scripts/set-test-passwords.ts`, `scripts/lib/test-credentials.ts` and the `test-users:passwords` script were deleted. The end-to-end flow reads `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` from `.env.local` and stops with a clear message if they are missing; new test students get a random password.
- **T2:** `src/env.ts` refuses to start when `DEV_DB_RESET_ALLOWED=yes` and `BETTER_AUTH_URL` is not localhost or 127.0.0.1 (exact host match, so `localhost.example.com` does not pass). Tested.
- **L1:** `readPermissionKeys` honours a grant only if the key is in `PERMISSIONS` **and** the role is eligible for it. A stray row (Student holding `admin.override`, an unknown key) is ignored by the server and still shown as a problem on the grid. Tested, including that real grants are not lost.
- **L3:** `loadRecord` receives `{ user, permissions }`. The Admin Users rules moved to `src/server/admin/policy.ts` and the four actions run through `authorizeRecord()`; the commands call the same rules again inside their transaction and keep the conditional UPDATE as race protection. The 33 existing approval tests pass unchanged.
- **L2:** `tests/permissions/coverage.test.ts` lists every server action (any file starting with "use server"), page, layout and route handler with the key it needs, checks the source really calls the check and names the key, and fails when a new one is not listed. `tests/permissions/actions-matrix.test.ts` calls the real actions with real `FormData` for ten kinds of actor (signed out, no username, pending, rejected, deactivated, student, faculty, admin, admin without `assign_role`, a student with stray admin grants). Both were proven by breaking things on purpose: an unregistered page and action, a removed check, and a weakened key requirement each made them fail.
- **N1:** `adminMayWrite` takes the typed `AdminWriteAction`. **N3:** the go-live checklist in §12. **D2 to D4:** `permissions.md` §2 and §7, `folder-structure.md` and `CLAUDE.md` describe the pattern as built, with the rule "use `not_allowed` only when the person may already see the record". **Deferred:** N2 (the browser flow leaves one student and one audit row per run; `npm run db:reset` cleans up) and N4 (Slice 10).

**Not in this slice:** real relationship and state rules for tasks, classes, assignments, files and teams (their slices); editing the permission grid, role changes, deactivation and the audit viewer (Slice 10). **The security review in a separate session is due now** (CLAUDE.md: end of Slices 1, 2 and 7).

## 19. Slice 3 notes (personal tasks; 3a to 3c built 26 Oct 2026)

**The owner's three decisions (26 Oct 2026).**
1. **Secondary buttons are teal outline** (D4 closed): brand teal text and border, transparent fill, in both themes. Coral stays the 10% accent for one signature action, the "Break this down" AI button in Slice 4. (`color-palette.md` §4 is updated with the first screens, 3d.)
2. **A deadline is a date with an optional time.** With no time, the task is due at **23:59 on that day in the user's time zone** (`users.timezone`). Stored as UTC `timestamptz`.
3. **Deleting has two ways back:** an **Undo** button in the toast right after deleting, and a **Deleted** list from which any deleted personal task can be restored later. There is no permanent delete.

**Rules R-a to R-i, confirmed by the owner on 26 Oct 2026 exactly as proposed** (`docs/slices/slice-3-plan.md` §3; the status and delete rules are also in `data-flows.md` §2):
- **R-a** Starting a step while its parent is To Do also starts the parent (`started_at` if empty, its own `status_changed` event).
- **R-a2** (owner, 28 Oct 2026, from Opus review C2) Completing a step straight from To Do while the parent is To Do also starts the parent, exactly like R-a: `started_at` if empty (never overwritten), same instant, its own `status_changed` event. A step is part of its parent, so work on a step is work on the task. **The screens must say so** (owner's request): when a command reports `parentStarted`, a toast tells the person, for example "Step started. The task was started with it.", so nobody is left wondering why the task moved. The actions `startTaskAction` and `completeTaskAction` return `data.parentStarted` for this.
- **R-b** No new steps on a Done parent ("Reopen the task to add steps").
- **R-c** No reopening a step of a Done parent ("Reopen the task first").
- **R-d** A step has a title, status, optional deadline and optional estimate. Category and priority are copied from the parent and follow it (every step, deleted ones too).
- **R-e** A step deadline after the parent's is allowed, with a warning on the form (screen only).
- **R-f** Deleting a parent soft-deletes its steps with it (same `deleted_at` and reason, one `deleted` event each).
- **R-g** Restoring a parent restores the steps deleted at the same moment (equal `deleted_at`) only. Restoring a step whose parent is still deleted is refused ("Restore the task first").
- **R-h** Restoring clears `deleted_at` and `deleted_reason` and writes a `restored` event; the task then counts normally in metrics.
- **R-i** Limits, all in `src/config/limits.ts`: title 1 to 200 characters, description up to 5,000, custom category label 1 to 40, estimate 1 to 6,000 minutes, at most 30 steps per task. The estimate range is also written into a database CHECK, so changing it later needs a migration as well.

**Small rules the code needed that the documents did not state** (built conservatively; say if any should change):
- A step that is **not done cannot be restored into a Done parent** (same reason as R-b and R-c: a Done parent must have every step done). Reopen the parent first.
- A **deadline can be moved, never removed.** Removing it would take a late task out of the metrics ("tasks without a deadline are never in the due set"). Moving it later still counts as a reschedule.
- **Reopen** goes to In progress by default (or To Do if chosen). Reopening to In progress a task that never had a start gives it a start now, because that is the first time its status is In progress. `completed_at` is cleared and an existing `started_at` is kept.
- **"When did you start?"** (`backfillStart`) works only on a Done task with no start, and the start must be between `created_at` and `completed_at`. A step never asks it.
- **A Done task's deadline is locked** (Opus review C1, 27 Oct 2026): on-time uses the current deadline, so moving it after the finish would turn a late task into an on-time one. The change is refused with "Reopen the task to change its deadline." Reopening clears `completed_at`, so a later finish is measured honestly against the new deadline (`data-model.md` §4 rule 5). Steps follow the same rule. Title, description, category, priority and estimate of a Done task stay editable.
- An action on a **deleted** task is refused with "This task is deleted. Restore it first." (the owner can already see it in the Deleted list, so it is a state refusal, not "not found").
- A step cannot have its own steps (one level only).

**Time (3b).** The form's local date and time become a UTC instant in **PostgreSQL** (`(date + time) AT TIME ZONE zone`, `src/server/tasks/time.ts`), which knows daylight saving; no date library and no hand-written offset arithmetic. A local time that does not exist (the clocks jump forward) or happens twice (they go back) is resolved by PostgreSQL's rules; the tests record what they are (London, 29 March and 25 October 2026). Display uses `Intl.DateTimeFormat` with the user's zone (`formatDeadline`, `isOverdue` in `src/lib/time.ts`); the time is always shown, so a date-only deadline visibly says 23:59.

**Bare UTC offsets are refused as time zones.** Node's `Intl` reads `+05:30` as 5½ hours east of UTC but PostgreSQL's `AT TIME ZONE` reads the same text as 5½ hours west, so a deadline would be 11 hours out. `isValidTimeZone` (one copy, in `src/lib/time.ts`) accepts IANA names only (`Asia/Kolkata`, `Asia/Calcutta`, `UTC`, `Etc/GMT+5`) and refuses anything starting with `+` or `-`. Tested in the settings action and in `localToUtc`.

**Schema (3a).** `tasks` and `task_events` are migration `0003_tasks.sql`. `assignment_id`, `team_id` and `ai_suggestion_id` are plain uuid columns **without foreign keys** because their tables do not exist yet; Slices 4, 7 and 11 add the keys in their own migrations, so the Slice 5 metric SQL is written against the final shape of `tasks`. The CHECKs: the three context shapes, done ⇔ `completed_at`, category Other ⇔ label, `deleted_at` ⇔ `deleted_reason`, `started_at <= completed_at`, `reschedule_count >= 0`, estimate range, no task is its own parent, plus the Opus review additions: `started_at` and `completed_at` not before `created_at`, estimate ⇔ estimate source, resubmission window only on assignment tasks, a deadline needs `original_deadline`, a title and a custom label are not blank, a personal task can only be deleted as `user_deleted`. `task_events` reuses the append-only trigger function from migration 0002 (UPDATE, DELETE and TRUNCATE refused). Maximum text lengths stay in Zod only. The enum value lists for category, priority and status are in `src/config/task-values.ts` so browser forms and the database share one list.

**Every timestamp comes from the app clock.** Each command takes `now()` once and writes `created_at`, `updated_at` and the event's `created_at` from it (the database defaults are only a fallback), so a fixed test clock gives one consistent set of instants and "overall time" cannot come out negative.

**Screens (3d), built 29 Oct 2026.** `/tasks` (Open, Done, All filters, a Deleted link, a first-task prompt on an empty list), `/tasks/new`, `/tasks/[taskId]` and `/tasks/deleted`, and a "Tasks" menu item for holders of `task.personal.manage`. Choices made with the owner: **"New task" is a pop-up on a wide screen and its own page on a phone** (the same link works both ways: below 768 px the click goes to `/tasks/new`); **dialogs are full-screen sheets on a phone** (`components/ui/dialog.tsx`, on Base UI) so the page stays usable even if something inside misbehaves; **the two questions are pop-ups**: "N steps are not done. Complete them too?" (Complete all, Cancel) and "When did you start?" (date and time, Save, Skip). "When did you start?" lives once on the page (`start-prompt.tsx`), not inside the Done button, because marking the task done refreshes the list and the button can disappear first. **Delete** shows a toast with **Undo** for 8 seconds, and the task stays in the Deleted list. **Secondary buttons are teal outline** (`Button` variant `secondary`). A deleted task's page shows only "This task is deleted" and Restore, never the normal buttons. A To Do task can be marked done from its page (To Do straight to Done is allowed), and then asks "When did you start?". Polish from the final Opus review (`docs/reviews/slice-3-opus-review.md`, 29 Oct 2026): **P1** the Deleted list shows steps deleted together with their task inside the task's row ("Deleted with 2 steps: Outline, Draft. They come back with the task.") instead of rows with Restore buttons the server would refuse; a step deleted on its own keeps its own row. **P2** the delete and restore messages and the Undo toast say "Step" for a step and "Task" for a task. Not built: changing a step's own deadline after it was created (the command supports it; the screen does not). Forms read their fields with an `onSubmit` handler, not `<form action>`, because React clears the form after an action even when the server answers with an error. The browser flow `tests/e2e/personal-tasks.spec.ts` (flow 2 of 3) covers: create with two steps in the pop-up, start a step and see the task start with its toast, Complete all, Undo after delete, restore from the Deleted list, the Admin getting "not found", and on a phone the new-task page and the start-time prompt. `E2E_SCREENSHOTS=<folder>` makes it save screenshots (light, dark, phone) for looking at the screens.

**Trying the app on a phone over the home Wi-Fi (29 Oct 2026, dev only).** Set `DEV_ALLOW_LAN=yes` in `.env.local` and start the server with `npm run dev -- -H 0.0.0.0` (by default Next listens on `::`, which on the owner's PC did not accept connections from the phone; listening on `0.0.0.0` fixed it); open the address of the computer's **Wi-Fi** adapter (`ipconfig`, "Wireless LAN adapter Wi-Fi", currently 192.168.1.x), not the first "Network" address Next prints: on the owner's PC that is 192.168.56.1, the VirtualBox Host-Only adapter, which a phone can never reach. The Wi-Fi address is handed out by the router and can change (the last number, sometimes after a router restart), so the switch accepts any private network address (10.x.x.x, 172.16-31.x.x, 192.168.x.x) rather than one address. Two places use it, both only when the switch is on and only in `npm run dev` (`src/env.ts` switches it off in a build, a production run and the tests, instead of failing, so the line can stay in `.env.local`; my first version threw in production and broke `npm run build` and the e2e run): `allowedDevOrigins` in `next.config.ts` (otherwise the page loads on the phone but Next.js blocks its scripts) and Better Auth's `trustedOrigins` (otherwise sign-in answers "Invalid origin"), through `lanTrustedOrigins()` in `src/server/auth/lan-origins.ts`, which trusts a request's own Origin only when `isPrivateLanOrigin()` says it is a private address. No wildcard is used for Better Auth: its `*` also matches dots, so `192.168.*` would accept `192.168.1.evil.com`. `BETTER_AUTH_URL` stays localhost, so the test-database guard (§18) is unchanged. Google sign-in does not work from the phone (Google only redirects to the registered address). The phone then reaches the test database, whose accounts share a simple password, so use this only on a network you trust. Tested in `tests/unit/lan-origins.test.ts`.

**Rules and commands (3c).** `src/server/tasks/policy.ts` has the relationship rule (my own personal task, anything else is "not found") and one state rule set per action. `commands.ts` is the only writer of `tasks` and `task_events`: one transaction per command, `SELECT ... FOR UPDATE` on the task (its parent first, so two commands cannot deadlock), the same rules run again on the locked row (so the second of two tabs is checked against the current row), then the writes and the events. Twelve server actions in `src/app/(app)/tasks/actions.ts`, one per command, all with the one key `task.personal.manage`; no key lets anyone read another person's personal task, and these files never look at an Admin permission (a test greps for it). A bug found by the tests: in a query without a join Drizzle writes a column without its table name, which made a step-count subquery compare the step with itself; the outer table is now written out as `"tasks"."id"`.

## 20. Still open

1. The wireframes do not yet show the requested-role field, the "When did you start?" prompt, the email-verified badge or the reset-link action. The documents decide; update the canvas when convenient.
2. **Performance (owner, 28 Oct 2026): a screen takes about 3 to 5 seconds to load on average. To optimise later, not now.** Measure first (production build, not `npm run dev`), then look at: the distance to the Neon database (US East from India; a Singapore or Mumbai project was already suggested for the live database), a new database connection and SSL handshake per request, the number of queries per page (session, account status, permission keys, then the page's own data, one after another), and the size of what the browser downloads. Do not change anything before there are numbers.
3. Later features: direct add of a student by username, team join codes, calendar sync, email sending, Cloudinary, per-student deadline extensions, CSV import.
