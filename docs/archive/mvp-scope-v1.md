# CampusFlow AI: MVP Scope (v1)

Status: agreed at the end of Phase 0. Changes to this document are recorded in the decision log.

## Goal

One platform where students and faculty manage academic work and personal tasks together, with an AI assistant that makes large tasks less intimidating and a Growth Tracker that shows how a student's productivity changes over time.

## Roles

- **Admin:** manages users, assigns roles, and edits which permissions each role has.
- **Faculty:** creates classes, posts assignments, reviews submissions.
- **Student:** joins classes, completes assignments, manages personal and team tasks.

Three fixed roles. Permissions per role are stored in the database and edited from the Admin page. Per-user custom permissions are post-MVP.

## In scope

**Accounts and access**
- Login, role-based access, server-side permission checks on every action
- Admin page: user list, role assignment, role-to-permission editor, simple audit log

**Personal tasks**
- Tasks with deadline, priority, status, estimated time and one level of subtasks
- Overdue detection and a simple daily/weekly view

**Academic**
- Faculty creates classes; students join with a randomly generated enrollment code
- Faculty posts assignments to a whole class; each student gets their own assigned task
- Students submit text, links, or uploaded PDF and image files
- Faculty sees submission status per student

**Teams**
- Students create teams and add members
- Shared tasks with an owner, deadline and status

**Dashboard**
- Upcoming deadlines across personal, academic and team tasks
- Overdue tasks and pending submissions
- Completion rate and on-time rate
- Average completion time

**AI (local Llama 3.2 3B via Ollama)**
- Break a task or assignment into subtasks (schema-forced JSON, validated in code, user edits before saving)
- Weekly summary written from metrics the application computes

**Growth Tracker v1**
- Trends over time: completion rate, on-time rate, estimated versus actual time, planned versus completed consistency
- All numbers computed in SQL from real data; the AI only explains them
- Demo uses a clearly labelled seed-data script that simulates earlier history

## Out of scope for now

- Communication features (announcements, messaging, discussions) and shared notes
- Notifications through third-party services
- Assignments to selected students only (stretch)
- Per-user custom permissions
- Conflict and overload detection by AI, AI prioritization
- Calendar sync, real-time collaboration, public cloud deployment

## Key decisions

| Decision | Choice | Reason |
|---|---|---|
| AI model | Local Llama 3.2 3B via Ollama | No per-use cost, student data stays local |
| AI output | Schema-forced JSON, validated, user-editable | Small models make mistakes |
| File storage | Local device storage behind permission checks | No paid cloud service needed |
| Metrics | Computed in SQL, never by the AI | Honest, explainable numbers |
| Permissions | Fixed roles, admin-editable role permissions | Flexible without a full custom permission system |
| Demo data | Seed-data script, labelled as simulated | Real usage history will be too short for trends |

## Constraints and assumptions

- Solo project, about 21 planned focused hours a week (about 18 realized)
- Stack: Next.js, TypeScript, PostgreSQL (Neon), Drizzle ORM, Better Auth, Tailwind, shadcn/ui
- Demo runs from the developer's laptop (local model)
- Evaluation: working demo, report, viva, novelty
- Exact demo and submission dates still to be confirmed

## Open items

- Confirm demo and submission dates
- Phase 1: precise definitions for statuses and metrics, user stories per role
