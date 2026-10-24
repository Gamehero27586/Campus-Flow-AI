# Campus Flow AI

A final-year project: a Next.js web app where students, faculty and an admin manage tasks, classes, assignments, submissions, teams and a personal Growth Tracker, with a local AI (Llama 3.2 3B through Ollama) that breaks tasks into steps.

Planning documents are in [`docs/`](docs/README.md). Working rules for Claude are in [`CLAUDE.md`](CLAUDE.md).

## Run it (Windows, PowerShell)

```powershell
npm install
Copy-Item .env.example .env.local   # then put your database string in .env.local
npm run db:migrate
npm run dev
```

Checks: `npm run typecheck`, `npm run lint`, `npm run test`.
