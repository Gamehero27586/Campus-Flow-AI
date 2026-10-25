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

## Test and live databases

`DATABASE_URL` in `.env.local` is the **test** database while developing; the live database is a separate Neon project whose string waits, unused, in `DATABASE_URL_LIVE`. On the test database you can start over at any time (needed because the audit log can never be edited or deleted):

```powershell
npm run db:reset                    # wipes the test database, re-applies migrations, re-seeds roles and permissions
npm run admin:promote -- you@example.com   # after signing up again
```

`db:reset` refuses to run unless `DEV_DB_RESET_ALLOWED=yes` is in `.env.local`, and refuses if `DATABASE_URL` is the live database. With that marker on, the app also refuses to start on any address except localhost.

Test accounts can share one password without it being written anywhere: copy one account's password hash to the others in the Neon console (the statement is in `docs/decisions.md` §18). The browser tests read the Admin's login from `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` in `.env.local`.

## Checks

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:e2e                    # builds, starts the app on port 3100, runs the browser flows
```

If a page looks old after switching branches or merging, stop `npm run dev`, delete the `.next` folder (`Remove-Item -Recurse -Force .next`), run `npm install`, and start it again.
