# Prompt for the Opus review (paste into Cowork with the planning files attached)

You are reviewing the Phase 0 to 2 planning pack for a final-year project, CampusFlow AI. I am a solo fourth-year CS student. Another Claude session wrote these documents with me over about two days; none of it has been reviewed by anyone else. Nothing is implemented yet. You will probably write most of the code later, and I will review and test it and have to explain every design decision in a viva. Be a critical second pair of eyes.

## Files
`decisions.md` (read first: it says which file wins), `mvp-scope-v2.md`, `data-model-draft-v0.4.md` with `er-diagram.png`, `permission-model-draft-v0.3.md`, `folder-structure-draft-v0.3.md`, `data-flows-draft.md`, `CLAUDE.md`, the plan spreadsheet and the wireframe canvas (link below). Older versions are history; ignore them.

## Constraints that are real
- Solo developer, about 21 hours per week, first demo around January or February 2027, final deadline in 2027, exams in November and December are not a big concern.
- AI must run locally: Llama 3.2 3B through Ollama on an ASUS TUF F15 (16 GB RAM, 4 GB GPU, about 39 tokens per second, 4096 context). No third-party AI API.
- Free or cheap hosting only (Neon free tier, local disk or Cloudinary free tier for files).
- Evaluation is a working demo, a report, a viva and novelty.

## What I want from you
1. **Simplify.** Where is the design heavier than a final-year project needs? Name specific tables, flows, permission keys, screens or rules that could be cut, merged or deferred, and what each cut saves in hours. Rank by saving.
2. **Find contradictions and gaps.** Check the documents against each other (scope versus data model versus permissions versus data flows versus wireframes). List every disagreement and every case that no document decides.
3. **Challenge risky decisions.** In particular: the single `tasks` table for three contexts, the 32-key editable permission grid, Admin override tiers, calculated (not stored) lateness, the metrics definitions (completion, on-time, consistency, 10-task trend minimum), soft delete rules, the join-request flow, username plus Better Auth, and the local 3B model for breakdown and summary (is schema-forced JSON realistic at that size?).
4. **Check the plan.** Is the slice order sensible? What should be built first to get a working end-to-end demo early? Is 310 to 470 hours realistic for what is left in scope, and what should the "must demo" core be if time runs short?
5. **Check the [Verify] items** against current documentation where you can (Better Auth extra fields and username, Next.js `proxy.ts`, Drizzle migrations, Ollama structured outputs, upload handling in route handlers).
6. **Viva readiness.** Which decisions would an examiner most likely attack, and is each one defensible with a one-paragraph answer?

## Output format
- A short verdict first (is this ready to build from, yes or no, and why).
- Then a table: finding, which file and section, severity (blocker, should fix, nice to have), proposed change, effort.
- Then a recommended trimmed scope and slice order, if you would change them.
- Do not rewrite the documents yet. Propose changes and wait for my approval. Mark anything you are unsure of.

Wireframes: (paste the canvas link here)
