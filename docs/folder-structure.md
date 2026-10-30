# CampusFlow AI: folder structure and conventions

Version 0.4, 24 Oct 2026. Approved design, updated after the Opus review. Items marked **[Verify]** depend on the current release of a tool and are checked in Slice 0. `decisions.md` wins if anything here disagrees with it.

Related documents: `mvp-scope.md`, `data-model.md`, `permissions.md`, `data-flows.md`, `color-palette.md`.

## What changed since v0.3

- Database driver fixed to **`pg`** (node-postgres); local PostgreSQL as the demo fallback; PGlite as the first candidate for tests.
- Upload route `/api/uploads` added; upload and download routes excluded from the `proxy.ts` matcher.
- Storage is local disk only (`cloudinary.ts` removed from the MVP).
- New: `src/server/rate-limit.ts`, `scripts/admin-promote.ts`, `scripts/files-cleanup.ts`, the CI workflow, theme tokens in `globals.css`.
- Route map updated to the 23 permission keys and the welcome gate.
- Repository folder renamed to lower case: `C:\dev\campus-flow-ai` (npm package names cannot contain capitals).

---

## 1. Principles

1. **Security-critical code is easy to find and cannot leak into the browser.** Everything that touches the database, permissions, files or the AI lives under `src/server/`. Pages and components never talk to the database directly.
2. **One folder per domain, with the same four files**, so one folder answers "how does this feature work and who may do what".
3. **Pages stay thin.** A page or server action validates input, asks "is this allowed?", calls one function and returns.
4. **Boring and predictable.** Same file names and the same shape for every action, so code written in different sessions looks the same and is easy to review.

## 2. Tooling defaults

| Item | Default | Notes |
|---|---|---|
| Language | TypeScript, `strict` on | |
| Framework | Next.js 16 App Router with `src/` | `proxy.ts` (formerly `middleware.ts`) exports `proxy` and runs on Node.js. Its default body buffer is 10 MB and larger bodies are **silently truncated**, hence the matcher exclusions in section 3 |
| Package manager | npm | |
| Database | PostgreSQL via Drizzle ORM with the **`pg` driver** | Same driver for Neon and local Postgres. Never `neon-http` (no interactive transactions). Migrations with `drizzle-kit generate` and `migrate`, committed, never edited once applied. Not `push` after Slice 0 |
| Auth | Better Auth with the Drizzle adapter and the username plugin | App-owned fields as `additionalFields` with `input: false`; IDs as UUID; no cookie cache; no implicit account linking. **[Verify]** option names |
| Validation | Zod at every boundary (forms, actions, route handlers, AI output) | Types inferred from schemas |
| UI | Tailwind CSS and shadcn/ui | Theme tokens from `color-palette.md` §4 in `src/app/globals.css`. **[Verify]** shadcn's current token format |
| Forms | react-hook-form with the Zod resolver | |
| Tests | Vitest (unit, policy, metrics, integration); Playwright for 3 flows | Test database chosen in Slice 0: try PGlite first (check the time zone functions the metric SQL uses), otherwise a local Postgres test database |
| CI | GitHub Actions: `npm ci`, `typecheck`, `lint`, `test` on every push | |
| Lint and format | ESLint and Prettier | `no-restricted-imports` forbids `@/server/db` outside `src/server/` (pages call domain queries and commands, never the database); `react/no-danger` forbids `dangerouslySetInnerHTML`; `server-only` makes any server file fail the build if a Client Component imports it |
| Dates | Stored in UTC; displayed in the user's time zone; `now()` is a function so tests can fix the time | |

## 3. Folder structure

```
campus-flow-ai/
  CLAUDE.md                 Working rules for Claude (copied from docs/ in Slice 0)
  docs/                     Current planning documents; docs/archive/ is history only
  drizzle/                  Generated SQL migrations (committed)
  eval/                     AI evaluation set (cases.json) and scoring rubric
  scripts/                  seed-base.ts, seed-demo.ts, admin-promote.ts, db-reset.ts (test database only), eval-ai.ts, files-cleanup.ts; lib/ holds the guard that keeps destructive scripts off the live database
  storage/                  Uploaded files (git-ignored, never inside public/)
  public/                   Static assets only
  tests/
    unit/                   Pure logic (gate, evaluate, rules, themes, messages)
    integration/            Database tests on an in-memory Postgres with the real migrations
    permissions/            coverage.test.ts (fails when a server action, page or route is missing its check) and actions-matrix.test.ts (the real actions, every kind of actor)
    e2e/                    Playwright flows
  .github/workflows/ci.yml  Typecheck, lint, test
  src/
    proxy.ts                Coarse redirect only: no session cookie goes to /sign-in. Username and status routing is gate() in server/auth/access-gate.ts. Never the only check
    env.ts                  Validated environment variables (imports "server-only")
    config/                 Limits and thresholds in one place (file size and count, code expiry options, tracker minimums, rate limits, AI timeouts)
    app/                    Routing and pages only
      globals.css           Theme tokens
      (public)/             sign-in, sign-up, reset-password/[token]
      (onboarding)/         welcome (username and optional requested role), pending
      (app)/                Signed-in shell (layout with navigation)
        dashboard/
        tasks/              page.tsx (list), new/ (the form as a page), [taskId]/ (detail), deleted/; actions.ts (the 12 task server actions), ai-actions.ts (the 4 AI breakdown actions), ai-breakdown.tsx (the button, review panel and rating); client pieces next to them: task-forms, task-buttons, start-prompt, task-card, task-badges, use-action-form
        tracker/
        classes/            join/, [classId]/ (assignments/, members/, tracker/)
        teams/              [teamId]/
        settings/
        admin/              users/, roles/, classes/, teams/, audit/
      api/
        auth/[...all]/      Better Auth handler
        uploads/            Permission-checked, streamed upload
        files/[fileId]/     Permission-checked download
    components/
      ui/                   shadcn components (dialog.tsx is a pop-up on a laptop and a full-screen sheet on a phone)
      layout/               Shell, navigation, "Viewing as admin" banner, "Simulated data" banner
      <feature>/            One folder per feature (tasks/, classes/, ...)
    lib/                    Pure helpers (time.ts, format.ts, errors.ts, result.ts), safe for client and server
    server/                 Server-only code. Every file imports "server-only"
      db/
        client.ts           pg Pool and Drizzle instance
        schema/             One file per domain, plus enums.ts and relations.ts
      auth/                 better-auth.ts (config), session.ts, current-user.ts, permission-keys.ts, load-permissions.ts
      policies/             authorize.ts, evaluate.ts (steps 1 to 3), evaluate-record.ts (steps 1 to 5), decision.ts, admin-access.ts. Each domain's own rules are in its policy.ts
      audit/                write-audit.ts
      rate-limit.ts         In-memory limiter (join codes, invitations, AI)
      storage/              types.ts (the interface), local.ts, index.ts
      tasks/                policy.ts, queries.ts, commands.ts, time.ts (local date and time to UTC, in PostgreSQL). The Zod schemas the forms share are in src/lib/schemas/tasks.ts; the fixed choices (category, priority, status and their labels) are in src/config/task-values.ts
      classes/              (same four files)
      assignments/          (same four files)
      submissions/          (same four files, includes grading)
      teams/                (same four files)
      files/                (same four files)
      admin/                (same four files: users, roles, permissions, transfers, reset links)
      metrics/              definitions.ts, queries.ts, types.ts
      ai/                   client.ts, runtime.ts, breakdown.ts, summary.ts, schemas.ts, prompts/, queue.ts, dates.ts, health.ts, warmup.ts, policy.ts, queries.ts, commands.ts, fake-client.ts (test switch only)
```

**`proxy.ts` matcher** excludes `/api/auth`, `/api/uploads`, `/api/files`, `/_next` and static files. **[Verify]** the matcher syntax in Slice 0.

### What the four files in a domain folder mean

| File | Contains | Rule |
|---|---|---|
| `policy.ts` | Plain functions answering "may this user do this to this record?", for example `canGradeSubmission(user, submission)` | No database access except what is passed in; easy to test |
| `queries.ts` | Reads. Every function takes the acting user and scopes the query, and returns plain objects with only the needed columns | Never "get by id" without a scope; never return a raw row to a Client Component |
| `commands.ts` | Writes. Each runs in a transaction, writes the audit entry when needed, and returns a result | The only place that inserts, updates or deletes (seed scripts excepted) |
| `schemas.ts` | Zod schemas for this domain's inputs | Shared by the form and the server. Schemas that a **browser form** uses live in `src/lib/schemas/<domain>.ts` instead, because browser code cannot import `src/server`; the server imports them from there. Server-only schemas stay in the domain folder |

## 4. Conventions

### Naming
- Files and folders: `kebab-case`. React components: `PascalCase`. Functions and variables: `camelCase`.
- Database columns `snake_case`; Drizzle maps them to `camelCase` fields.
- Permission keys: `module.thing.action` strings defined once in `permission-keys.ts` with module, description, eligible roles and default roles; the seed writes them to the database.
- Enums are defined once in `db/schema/enums.ts` and reused by Zod schemas.
- Imports use the `@/` alias for `src/`.

### Every server action has the same shape
1. Parse input with Zod (field-level messages on failure).
2. Get the current user and run `authorize()` (account status, permission key, then the relationship with the record).
3. Call one command from `src/server/<domain>/commands.ts`.
4. Revalidate the affected pages.
5. Return a result object.

Pages check access in their own data function too; a check in a layout is never enough.

### Results and errors
- Expected failures (validation, not allowed, not found, closed assignment) return `{ ok: false, error: { code, message } }`. Unexpected failures throw.
- A record the user may not see is **not found**, never "forbidden".

### Database
- IDs are UUIDs. All timestamps `timestamptz`. Tests fix the clock through `now()`.
- Multi-table changes use one transaction (`db.transaction`). Audit entries are written inside the same transaction.
- `audit_logs` and `task_events` get an append-only trigger in their migration.
- Task timestamp fields are changed only by `server/tasks/commands.ts`.
- Seeds: `seed-base` (roles, permissions, default grants) and `seed-demo` (seed users with `is_seed = true` and their history, written directly). The first Admin comes only from `admin-promote`.

### Files
- `storage/` is outside `public/`. File names on disk are random IDs.
- Uploads only through `POST /api/uploads` (raw body, streamed, size counted, type sniffed); downloads only through `/api/files/[fileId]` (section 5 of `data-flows.md`).
- The caps are values in `src/config/`.

### AI
- All Ollama calls go through `server/ai/client.ts` (model name and URL from the environment; Ollama stays on `127.0.0.1`).
- Every request uses a JSON schema in `format`, validates the response, retries once, then falls back.
- Prompts live in versioned files (`prompts/breakdown.v1.ts`); the version is saved in `ai_suggestions.prompt_version`.
- Requests run one at a time through `queue.ts`; `warmup.ts` loads the model when the server starts.
- `scripts/eval-ai.ts` runs `eval/cases.json` and writes a scoring table.

### Metrics
- Definitions (timeframes, exclusions, thresholds) are coded in `server/metrics/definitions.ts`, and nowhere else; thresholds come from `src/config/`.
- Each metric has a test with a hand-calculated example.

### Git
- `main` always works. One short-lived branch per slice: `slice-3-personal-tasks`.
- Commit messages: a short imperative sentence. Documents changed in a slice are committed with it.
- Tag the end of each slice (`slice-3-done`).
- `.env.local`, `storage/` and `node_modules/` are ignored. `.env.example` is committed.

### Scripts (package.json)
`dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:studio`, `seed:base`, `seed:demo`, `admin:promote`, `eval:ai`, `files:cleanup`.

## 5. Route map

Every page requires a permission key (and the relationship check where it names one record). The key decides whether the menu shows the page; the server checks again.

| Route | Who | Key |
|---|---|---|
| `/sign-in`, `/sign-up`, `/reset-password/[token]` | Anyone | none |
| `/welcome` | Signed-in users without a username (shown once) | none (status check allows it) |
| `/pending` | Pending users | none (status check allows it) |
| `/dashboard` | All active users; content follows the role | `dashboard.view` |
| `/tasks`, `/tasks/new`, `/tasks/[taskId]`, `/tasks/deleted` | Students (Faculty if enabled) | `task.personal.manage`; assignment tasks `assignment.view`; team tasks `team.use` |
| `/tracker` | Students (Faculty if enabled) | `tracker.personal.view` |
| `/classes` | Students, Faculty, Admin | `class.view` |
| `/classes/join` | Students | `class.join` |
| `/classes/[classId]` | Members, class Faculty, Admin (read-only) | `class.view` |
| `/classes/[classId]/assignments/new` | Class Faculty | `assignment.manage` |
| `/classes/[classId]/assignments/[assignmentId]` | Class Faculty (list, grade); Admin read-only. Recipients see their task page instead | `assignment.view`, `submission.view`; grading needs `submission.grade` |
| `/classes/[classId]/members` | Class Faculty (roster, Requests and Declined tabs, codes, approval setting, co-teachers for the owner); Admin read-only | `class.members.manage` (Admin: `admin.override`) |
| `/classes/[classId]/tracker` | Class Faculty, Admin read-only | `tracker.class.view` |
| `/teams`, `/teams/[teamId]` | Active members (invitations on `/teams`); Admin read-only | `team.use` |
| `/settings` | All active users (time zone, password) | none |
| `/admin` | Admin | `admin.users.manage` |
| `/admin/users` | Admin | `admin.users.manage` |
| `/admin/roles` | Admin | `admin.roles.edit_permissions` |
| `/admin/audit` | Admin | `admin.audit.view` |
| `/admin/classes`, `/admin/teams` | Admin | `admin.override` |
| `/api/auth/[...all]` | Better Auth | handled by the library |
| `POST /api/uploads` | Active users with `file.upload` | `file.upload` plus the target's relationship |
| `GET /api/files/[fileId]` | Any signed-in, active user | decided by the file's parent record |

## 6. Slice 0 checklist

1. Create the Next.js 16 project inside the existing repository `C:\dev\campus-flow-ai`, on Windows: `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`. It accepts a folder holding only `.git` and `docs`, so keep `docs/` untouched and do not create other root files first. Then add the folders above and the lint rules.
2. Copy `docs/CLAUDE.md` to the root (only after step 1; the installer refuses a folder containing it).
3. Environment: `env.ts`, `.env.example`, a Neon database, a local PostgreSQL database, the Ollama URL and model name.
4. Drizzle client with `pg`, an empty first migration, `db:*` scripts working against both databases.
5. Test setup: Vitest running one trivial test; decide the test database (PGlite first).
6. Theme tokens from `color-palette.md` §4 in `globals.css`; shadcn initialised.
7. CI workflow passing; Dependabot alerts on in GitHub.
8. Commit and tag `slice-0-done`.
