# CampusFlow AI: working rules for Claude

Copy this file to the repository root in Slice 0 and keep it short; the details live in `docs/`.

## What this project is

A final-year project: a Next.js web app where students, faculty and an admin manage tasks, classes, assignments, submissions, teams and a personal Growth Tracker, with a local AI (Llama 3.2 3B through Ollama) that breaks tasks into steps and adds suggestions to a weekly summary. The owner is a solo fourth-year CS student. You (Claude) write most of the code; the owner reviews, tests and must be able to explain every design choice in a viva.

## Read first

1. `docs/decisions.md`: what is decided and which document wins.
2. The document for the area you are touching: `mvp-scope.md`, `data-model.md`, `permissions.md`, `folder-structure.md`, `data-flows.md`, `color-palette.md`.
3. **Ignore `docs/archive/`.** It holds old versions and the review; never build from it.
4. Better Auth, Next.js 16, Drizzle and Ollama change quickly. Check their current documentation before using an API; do not rely on memory. Items marked **[Verify]** in the documents must be checked.

## How to work with the owner

- Work in **slices** (`mvp-scope.md` §11). One branch per slice, `main` always works, tag `slice-N-done`.
- **Git is the owner's job.** Never run a git command that changes anything (add, commit, branch, checkout, merge, tag, push, stash, reset) unless the owner tells you to. Read-only commands (`status`, `diff`, `log`) are fine. At the end of a slice, give the owner the commands to run.
- Before a slice: say what you will build, which files, and what the owner should test. After: say what changed and how to try it. For auth, permissions and file handling, point out the lines the owner must read carefully.
- Explain choices in plain language. Prefer boring, predictable code. Do not add features, libraries or abstractions that are not in the documents; propose them first.
- If a document is unclear or two documents disagree, stop and ask. Do not guess on permissions, deadlines, metrics or visibility.
- Never mark something done without running `typecheck`, `lint` and `test`.
- The owner uses **Windows and PowerShell**. Give commands that work there.
- At the end of Slices 1, 2 and 7, stop and suggest a security review in a separate session before merging.

## Stack and commands

Next.js 16 App Router (`src/`), TypeScript strict, PostgreSQL (Neon, local fallback) via Drizzle with the **`pg` driver** (never `neon-http`), Better Auth, Tailwind and shadcn/ui, Zod, react-hook-form, Vitest and Playwright. Package manager: **npm**.

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `format`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:studio`, and, added with the slice that needs them, `seed:base`, `seed:demo`, `admin:promote`, `eval:ai`, `files:cleanup`.

Next.js 16 ships its own documentation in `node_modules/next/dist/docs/`; read the relevant page there before using a Next.js API (`AGENTS.md` says the same).

Migrations: `db:generate` and `db:migrate`, committed, never edited after being applied.

## Structure and conventions

- All database, permission, file and AI code lives in `src/server/`. Every file there imports `server-only`. Pages and components never import the database (a lint rule enforces this).
- One folder per domain in `src/server/<domain>/` with `policy.ts`, `queries.ts`, `commands.ts`, `schemas.ts`.
- Every server action: parse with Zod, get the user, call `authorize()`, call one command, revalidate, return `{ ok, ... }`.
- Queries select only the columns a screen needs and return plain objects. **Never pass a raw database row to a Client Component.**
- A record the user may not see is "not found", never "forbidden".
- All timestamps are UTC `timestamptz`; time comes from a `now()` function so tests can fix it.
- Metric definitions live only in `src/server/metrics/definitions.ts`. Task timestamp rules live only in `src/server/tasks/commands.ts`. Limits and thresholds live only in `src/config/`.
- UI uses the theme tokens from `color-palette.md` (shadcn CSS variables). No raw hex values in components.
- Names: files kebab-case, components PascalCase, columns snake_case, imports with `@/`.

## Security rules (non-negotiable)

1. Every protected action is checked on the server, in the five-step order: signed in, account active, permission key, relationship to the record, record state.
2. The check runs in every page's data function and every server action and route handler. A layout or `proxy.ts` may redirect for convenience, but is never the check.
3. Reads are scoped to the acting user. Never "get by id" without a scope.
4. No permission key exists for reading another user's personal tasks, personal tracker or AI history. Do not add one. Admin never sees tier 1 data, and Admin never writes academic or team records (only the two transfer actions).
5. Better Auth: every app-owned field on `user` is an `additionalField` with `input: false`. `session.cookieCache` stays off. Account linking is not implicit. The `is-username-available` endpoint is disabled.
6. Files: uploads only through `/api/uploads` (streamed, size counted, type sniffed from content); downloads only through `/api/files/[fileId]` after the parent's policy passes. Random storage keys, files outside `public/`, `X-Content-Type-Options: nosniff`, CSP sandbox, encoded file names. Both routes are excluded from the `proxy.ts` matcher.
7. Permissions are read per request, never stored in the session token.
8. Changes to roles, permissions, account status, reset links and both transfers are written to `audit_logs` in the same transaction. `audit_logs` and `task_events` are append-only (database trigger).
9. AI output and user-written text are rendered as plain text. Never `dangerouslySetInnerHTML`; no Markdown renderer that allows HTML.
10. Secrets stay in `.env.local`; only `.env.example` is committed. Never put a secret in a `NEXT_PUBLIC_` variable. `src/env.ts` imports `server-only`.
11. Nobody is ever promoted to Admin by runtime code; only by an existing Admin or the `admin:promote` script.
12. Keep Next.js on the latest patched release and run `npm audit` at the end of each slice.

## Tests

Write tests with the code, not after. Required: a table-driven permission suite (acting user type by action by relationship by expected result), metric tests with hand-calculated fixtures and a fixed clock, a test for each status and timestamp rule, the `update-user` test from rule 5, an upload test with a file just under the cap (checksum compared), and 3 Playwright flows. Lateness is calculated, never stored; test it from `submitted_at` against the current deadline.

## AI rules

- All calls go through `src/server/ai/client.ts` and a single in-process queue (one GPU).
- Force JSON with the schema in Ollama's `format`, validate with Zod, retry once, then fall back with a clear message.
- Code, not the model, assigns dates and writes every number. In the weekly summary the model writes only suggestions, and any output containing a digit is rejected.
- Prompts are versioned files; save `prompt_version` with each suggestion. `eval:ai` runs `eval/cases.json`.

## Demo data

Simulated users have `is_seed = true`; everything they own is simulated and the UI labels it as sample data. Never mix seed and real data silently. The seed script writes rows directly (it is the one allowed exception to "only commands write tasks").
