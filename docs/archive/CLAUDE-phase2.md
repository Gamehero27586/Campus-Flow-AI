# CampusFlow AI: working rules for Claude

Draft for the repository root. Copy to `CLAUDE.md` in Slice 0 and keep it short; the details live in `docs/`.

## What this project is

A final-year project: a Next.js web app where students, faculty and an admin manage tasks, classes, assignments, submissions, teams and a personal Growth Tracker, with a local AI (Llama 3.2 3B through Ollama) that breaks tasks into steps and writes a weekly summary. The owner is a solo fourth-year CS student. You (Claude) write most of the code; the owner reviews, tests and must be able to explain every design choice in a viva.

## Read first

1. `docs/decisions.md` (what is decided, which document wins).
2. The document for the area you are touching: `data-model-draft-v0.4.md`, `permission-model-draft-v0.3.md`, `folder-structure-draft-v0.3.md`, `data-flows-draft.md`, `mvp-scope-v2.md`.
3. Items marked **[Verify]** in those documents: check the current library documentation before relying on them.

## How to work with the owner

- Work in **slices** (see `mvp-scope-v2.md`, build slices). One slice per branch, `main` always works, tag `slice-N-done`.
- Before a slice: say what you will build, which files, and what the owner should test. After: say what changed and how to try it.
- Explain choices in plain language. Prefer boring and predictable code over clever code. Do not add features, libraries or abstractions that are not in the documents; propose them first.
- If a document is unclear or two documents disagree, stop and ask. Do not guess on rules about permissions, deadlines, metrics or visibility.
- Never mark something done without running the tests and the type check.

## Stack and commands

Next.js App Router (`src/`), TypeScript strict, PostgreSQL on Neon via Drizzle (migrations with `db:generate` and `db:migrate`, committed, never edited after being applied), Better Auth, Tailwind and shadcn/ui, Zod, react-hook-form, Vitest and Playwright. Package manager: **npm**.

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:studio`, `seed:base`, `seed:demo`, `eval:ai`, `files:cleanup`.

## Structure and conventions

- All database, permission, file and AI code lives in `src/server/`. Every file there imports `server-only`. Pages and components never import the database.
- One folder per domain in `src/server/<domain>/` with `policy.ts`, `queries.ts`, `commands.ts`, `schemas.ts`.
- Every server action: parse with Zod, get the user, call `authorize()`, call one command, revalidate, return `{ ok, ... }`.
- A record the user may not see is "not found", never "forbidden".
- All timestamps are UTC `timestamptz`; time comes from a `now()` function so tests can fix it.
- Metric definitions live only in `src/server/metrics/definitions.ts`. Task timestamp rules live only in `src/server/tasks/commands.ts`.
- Names: files kebab-case, components PascalCase, columns snake_case, imports with `@/`.

## Security rules (non-negotiable)

1. Every protected action is checked on the server, in the five-step order: signed in, account active, permission key, relationship to the record, record state.
2. Reads are scoped to the acting user. Never "get by id" without a scope.
3. No permission key exists for reading another user's personal tasks, personal tracker or AI history. Do not add one. Admin never sees tier 1 data.
4. Files are served only through `/api/files/[fileId]` after the parent record's policy passes. Random storage keys, content sniffing, `Content-Disposition: attachment`, `nosniff`. Files live outside `public/`.
5. Permissions are read per request, never stored in the session token. `proxy.ts` is coarse routing only, never the only check.
6. Changes to roles, permissions, account status and every Admin override are written to `audit_logs` in the same transaction.
7. Secrets stay in `.env.local`; only `.env.example` is committed.

## Tests

Write tests with the code, not after. Required: a table-driven permission test suite (acting user type by action by relationship by expected result), metric tests with hand-calculated fixtures and a fixed clock, a test for each status and timestamp rule, and 2 to 3 Playwright flows. Lateness is calculated, never stored; test it from `submitted_at` against the current deadline.

## AI rules

- All calls go through `src/server/ai/client.ts` and a single in-process queue (one GPU).
- Force JSON with a schema, validate with Zod, retry once, then fall back with a clear message.
- Code, not the model, assigns dates. Every number in a weekly summary must exist in the input metrics.
- Prompts are versioned files; save `prompt_version` with each suggestion. `eval:ai` runs `eval/cases.json`.

## Demo data

Simulated rows have `is_seed = true` and are labelled as sample data in the UI. Never mix them silently with real data.
