# Campus Flow AI

A final-year project: a Next.js web app where students, faculty and an admin manage tasks, classes, assignments, submissions, teams and a personal Growth Tracker, with a local AI (Llama 3.2 3B through Ollama) that breaks tasks into steps.

Planning documents are in [`docs/`](docs/README.md). Working rules for Claude are in [`CLAUDE.md`](CLAUDE.md).

## Run it (Windows, PowerShell)

```powershell
npm install
Copy-Item .env.example .env.local   # then fill in .env.local (database, auth secret, Google)
npm run db:migrate                  # create the tables
npm run seed:base                   # roles, permission keys, default grants (safe to repeat)
npm run dev
```

Open the app at exactly the address in `BETTER_AUTH_URL` (`http://localhost:3000` by default). Better Auth refuses requests from any other address, so `http://127.0.0.1:3000` fails with an "invalid origin" error.

## Become the first Admin

Sign up in the app, finish the welcome step, then run this once:

```powershell
npm run admin:promote -- you@example.com
```

It refuses if an active Admin already exists. After that, new accounts are approved from the Users page.

## Checks

```powershell
npm run typecheck
npm run lint
npm run test
```
