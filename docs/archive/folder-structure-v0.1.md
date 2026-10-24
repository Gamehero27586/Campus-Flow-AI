# CampusFlow AI: folder structure and conventions (v0.1)

Phase 2, step 3. A design draft, **not** code. Not final until the owner approves it. Items marked **[Verify]** depend on the current release of a tool and must be checked against its documentation when the project is set up (Slice 0).

Related documents: `mvp-scope.md`, `data-model-draft.md`, `permission-model-draft.md`.

---

## 1. Principles

1. **Security-critical code is easy to find and cannot leak into the browser.** Everything that touches the database, permissions, files, or the AI lives under `src/server/`. Pages and components never talk to the database directly.
2. **One folder per domain, with the same three files.** For each area (tasks, classes, assignments and so on), the rules, the reads and the writes sit side by side, so one folder answers "how does this feature work and who may do what".
3. **Pages stay thin.** A page or server action validates input, asks "is this allowed?", calls one function, and returns. The logic lives in `src/server/`.
4. **Boring and predictable.** Same file names, same shape of every action, so code Claude writes in different sessions looks the same and is easy to review.

## 2. Tooling defaults

| Item | Default | Notes |
|---|---|---|
| Language | TypeScript, `strict` on | |
| Framework | Next.js App Router with a `src/` directory | Next.js 16 renamed `middleware.ts` to `proxy.ts`; the file runs on Node.js **[Verify]** |
| Package manager | pnpm | Scripts below work with npm too if pnpm causes trouble on Windows |
| Database | Neon PostgreSQL via Drizzle ORM, migrations with `drizzle-kit generate` and `migrate` | Not `push` after Slice 0. Migrations are committed and never edited once applied **[Verify]** |
| Auth | Better Auth with the Drizzle adapter; `user` extended with the fields in the data model | How extra fields are declared must be checked in the current docs **[Verify]** |
| Validation | Zod, at every boundary (forms, actions, route handlers, AI output) | Types are inferred from schemas |
| UI | Tailwind CSS and shadcn/ui | |
| Forms | react-hook-form with Zod resolver | Final choice in Slice 3 |
| Tests | Vitest (unit, policy, metrics, integration); Playwright for 2 to 3 end-to-end flows | Test database approach decided in Slice 0 |
| Lint and format | ESLint and Prettier | A lint rule forbids importing the database outside `src/server/` |
| Dates | Stored in UTC; converted for display with the user's timezone; `now()` is a function so tests can fix the time | |

## 3. Folder structure

```
campusflow/
  CLAUDE.md                 Working rules for Claude (created in Slice 0)
  docs/                     Planning documents, decisions.md, ER diagram
  drizzle/                  Generated SQL migrations (committed)
  eval/                     AI evaluation set (cases.json) and scoring rubric
  scripts/                  seed-base.ts, seed-demo.ts, eval-ai.ts
  storage/                  Uploaded files in local mode (git-ignored, never inside public/)
  public/                   Static assets only
  tests/
    e2e/                    Playwright flows
  src/
    proxy.ts                Coarse redirects only (signed out, pending). Never the only check
    env.ts                  Validated environment variables
    config/                 Limits and thresholds in one place (file size, code expiry options, tracker minimums)
    app/                    Routing and pages only
      (public)/             sign-in, sign-up
      (pending)/            waiting-for-approval page
      (app)/                Signed-in shell (layout with navigation)
        dashboard/
        tasks/              [taskId]/
        tracker/
        classes/            join/, [classId]/ (assignments/, members/, tracker/)
        teams/              [teamId]/
        settings/
        admin/              users/, roles/, classes/, teams/, audit/
      api/
        auth/[...all]/      Better Auth handler
        files/[fileId]/     Permission-checked file download
    components/
      ui/                   shadcn components
      layout/               Shell, navigation, "Acting as admin" banner
      <feature>/            One folder per feature (tasks/, classes/, ...)
    lib/                    Pure helpers (time.ts, format.ts, errors.ts, result.ts), safe for client and server
    server/                 Server-only code. Every file imports "server-only"
      db/
        client.ts
        schema/             One file per domain, plus enums.ts and relations.ts
      auth/                 session.ts, current-user.ts, permission-keys.ts, load-permissions.ts
      policies/             authorize.ts and shared helpers (admin override, class capacity)
      audit/                write-audit.ts
      storage/              types.ts (the interface), local.ts, cloudinary.ts, index.ts
      tasks/                policy.ts, queries.ts, commands.ts, schemas.ts
      classes/              (same four files)
      assignments/          (same four files)
      submissions/          (same four files, includes grading)
      teams/                (same four files)
      files/                (same four files)
      admin/                (same four files: users, roles, permissions)
      metrics/              definitions.ts, queries.ts, types.ts
      ai/                   client.ts, breakdown.ts, summary.ts, estimate.ts, schemas.ts, prompts/, queue.ts
```

### What the four files in a domain folder mean

| File | Contains | Rule |
|---|---|---|
| `policy.ts` | Plain functions answering "may this user do this to this record?", for example `canGradeSubmission(user, submission)` | No database access except what is passed in; easy to test |
| `queries.ts` | Reads. Every function takes the acting user and scopes the query | Never "get by id" without a scope |
| `commands.ts` | Writes. Each one runs in a transaction, writes the audit entry when needed, and returns a result | The only place that inserts, updates or deletes |
| `schemas.ts` | Zod schemas for this domain's inputs | Shared by the form and the server |

**Change from the permission draft:** it provisionally listed `src/server/policies/` and `src/server/data/`. Per-domain folders replace the split `data/`; `policies/` keeps only the shared pieces (the `authorize` function, the Admin override rule, the owner and co-teacher helper).

## 4. Conventions

### Naming
- Files and folders: `kebab-case`. React components: `PascalCase`. Functions and variables: `camelCase`.
- Database columns are `snake_case`; Drizzle maps them to `camelCase` fields.
- Permission keys: `module.thing.action` strings defined once in `permission-keys.ts` (typed list); the seed script writes them to the database.
- Enums are defined once in `db/schema/enums.ts` and reused by Zod schemas.
- Imports use the `@/` alias for `src/`.

### Every server action has the same shape
1. Parse input with Zod (reject bad input with a field-level message).
2. Get the current user and run `authorize()` (account status, permission key, then the relationship check with the record).
3. Call one command from `src/server/<domain>/commands.ts`.
4. Revalidate the affected pages.
5. Return a result object.

### Results and errors
- Expected failures (validation, forbidden, not found, closed assignment) return `{ ok: false, error: { code, message } }`. Unexpected failures throw.
- A record the user may not see is reported as **not found**, never "forbidden", so existence is not leaked.

### Database
- IDs are UUIDs created by the database.
- All timestamps are `timestamptz`. Tests fix the clock through `now()`.
- Multi-table changes use one transaction. Audit entries for roles, permissions, status changes and Admin overrides are written inside the same transaction.
- `reschedule_count`, `started_at` and the other task fields in the data model are changed only by functions in `server/tasks/commands.ts`, so the timestamp rules (data model, "Rules agreed") live in exactly one place.
- Seeds come in two layers: `seed-base` (roles, permissions, role grants, first admin from an environment variable) and `seed-demo` (simulated users and history, every row `is_seed = true`).

### Files
- `storage/` (local mode) is outside `public/`. File names on disk are random IDs.
- Downloads go only through `/api/files/[fileId]`, which finds the parent record and runs its policy before streaming the bytes.
- The size cap is a value in `src/config/`.

### AI
- All Ollama calls go through `server/ai/client.ts` (model name and URL come from the environment).
- Every request uses a JSON schema, validates the response, retries once, then falls back.
- Prompts live in versioned files (`prompts/breakdown.v1.ts` and so on); the version string is saved in `ai_suggestions.prompt_version`.
- Requests run one at a time through `queue.ts`.
- `scripts/eval-ai.ts` runs the cases in `eval/cases.json` and writes a scoring table.

### Metrics
- Definitions (week boundaries, exclusions, minimum sample) are documented and coded in `server/metrics/definitions.ts`, and nowhere else.
- Each metric has a test with a hand-calculated example.

### Git
- `main` is always working. One short-lived branch per slice: `slice-3-personal-tasks`.
- Commit messages: a short imperative sentence ("Add task status transitions"). Documents changed in a slice are committed with it.
- Tag the end of each slice (`slice-3-done`).
- `.env.local`, `storage/` and `node_modules/` are ignored. `.env.example` is committed.

### Scripts (package.json)
`dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:studio`, `seed:base`, `seed:demo`, `eval:ai`.

## 5. Route map

Every page requires a permission key (and the relationship check where it names one record). The key decides whether the menu shows the page; the server checks again.

| Route | Who | Key |
|---|---|---|
| `/sign-in`, `/sign-up` | Anyone | none |
| `/pending` | Pending users | none (account status check) |
| `/dashboard` | All active users; content depends on the role | `dashboard.student.view`, `dashboard.faculty.view` or `admin.dashboard.view` |
| `/tasks`, `/tasks/[taskId]` | Student (Admin if granted) | `task.personal.manage`; assignment tasks also `assignment.view` |
| `/tracker` | Student | `tracker.personal.view` |
| `/classes` | Student, Faculty, Admin | `class.view` |
| `/classes/join` | Student | `class.join` |
| `/classes/[classId]` | Members, class Faculty, Admin | `class.view` |
| `/classes/[classId]/assignments/new` | Class Faculty, Admin | `assignment.post` |
| `/classes/[classId]/assignments/[assignmentId]` | Class Faculty, Admin (list and grade); recipients see their task page instead | `assignment.view`, `submission.view`, `submission.grade` |
| `/classes/[classId]/members` | Class Faculty, Admin | `class.members.manage` |
| `/classes/[classId]/tracker` | Class Faculty, Admin | `tracker.class.view` |
| `/teams`, `/teams/[teamId]` | Active members (invitations on `/teams`), Admin | `team.view` |
| `/settings` | All active users | none |
| `/admin` | Admin | `admin.dashboard.view` |
| `/admin/users`, `/admin/roles`, `/admin/audit` | Admin | `admin.users.view`, `admin.roles.edit_permissions`, `admin.audit.view` |
| `/admin/classes`, `/admin/teams` | Admin | `class.view`, `team.view` (override) |
| `/api/auth/[...all]` | Better Auth | handled by the library |
| `/api/files/[fileId]` | Any signed-in user | decided by the file's parent record |

## 6. Slice 0 checklist (for the build phase)

1. Create the Next.js project in `C:\dev\campusflow` with the folders above and the aliases and lint rules.
2. Add `CLAUDE.md` (working rules, links to the docs, the conventions from this document).
3. Environment: `env.ts`, `.env.example`, Neon database, Ollama URL and model name.
4. Drizzle client and an empty first migration; `db:*` scripts working.
5. Test setup: Vitest running a trivial test; decide the test database approach.
6. First commit and tag `slice-0-done`.

## 7. Open decisions

1. pnpm as the package manager (npm if it causes trouble).
2. Domain folders with `policy.ts`, `queries.ts`, `commands.ts`, `schemas.ts` (instead of layer folders).
3. Test database approach, to be settled in Slice 0 (a separate Neon branch, a local PostgreSQL, or an in-process PostgreSQL).
