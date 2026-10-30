# Slice 4 (AI task breakdown): final Opus review

Reviewed 30 Oct 2026: 4a to 4e. Files: `src/server/ai/*` (client, schemas, breakdown, prompts v1 and v2, queue, dates, health, warmup, runtime, fake-client, policy, queries, commands), `src/instrumentation.ts`, `createStepsFromBreakdown` and `breakdownRules` in `src/server/tasks/`, `src/lib/schemas/ai.ts`, `src/app/(app)/tasks/ai-actions.ts` and `ai-breakdown.tsx`, migration `0004`, and the tests (`ai-commands` 45 cases, `ai-dates` 10, `queue` 12, the 4a unit tests, the schema tests, the permission matrix and coverage, and `tests/e2e/ai-breakdown.spec.ts`). `tsc` and `eslint` pass. The owner runs `npm run test`, `npm run test:e2e` (twice) and `npm audit`.

The owner's test task "Library Management Software" (student `arjun_manish7`) was checked in Drizzle Studio with read-only queries; the result is in section 4.

---

## 1. Verdict

**Slice 4 is complete and ready to commit and tag `slice-4-done`.** No security issue was found and nothing blocks. Note that nothing since Slice 3 is committed yet (`HEAD` is the Slice 3 commit), so 4a to 4e should be committed now.

What holds:
- **Safety of the model connection.** The client refuses any Ollama address other than this computer; the fake model used by the browser test can only be switched on together with the test-database marker (`src/env.ts`), so it can never answer real users; the warm-up runs only when the server starts, never during a build or in tests.
- **Nothing invalid is saved.** The answer is validated (with one retry) before the student sees it; the student's edited list is validated again on the server; saving needs a pending, valid suggestion of the same user **for the same task** (checked under a row lock, with a test); duplicate positions are refused by the form schema, so `items_kept` can never be inflated; the database itself refuses saving an invalid answer (B2).
- **Rules AI-a to AI-j are built as confirmed:** eligibility and the room for at least 3 steps (one shared function used by both the rule and the page); repeats of existing steps dropped; links and email addresses dropped from AI steps; dates assigned by code (end of the local day, never after the task's deadline, the last step at the deadline); both keys on all four actions; accepted versus edited, `items_kept`, the optional rating; the queue (one at a time, 3 waiting, one per person, 10 seconds between requests, a job limit longer than two model calls so a timed-out call does not overlap the next one).
- **No database transaction is held while the model thinks** (seconds), and saving re-checks everything under locks, so a task changed in the meantime is caught.
- **Privacy:** suggestions are tier 1; every query is scoped to the owner; Admin and Faculty are refused (in the matrix).
- **Screens:** the coral **Break this down** button (disabled with a reason when offline, Done, a step, or too many steps), "Breaking it down... usually under 10 seconds", the review panel ("Suggested by AI. Check them before saving."), plain text only.
- **Prompt choice:** v2 is current (owner's decision, 30 Oct 2026), and both evaluation runs are kept with a fixed seed for comparison.

## 2. Notes (no blocking change)

| ID | Note | Suggestion |
|---|---|---|
| K1 | **What happens to AI steps edited after saving.** The suggestion's `outcome` (accepted or edited) records what happened **in the review panel** and does not change later. A step keeps `source = 'ai_breakdown'` and its link to the suggestion when it is edited later. Changing its **estimate** later turns `estimate_source` from `ai` into `user` (so that is measurable). Changing its **title** later leaves no trace except `updated_at`, because `task_events` has no "edited" event. Deleting or completing it is recorded (events, timestamps) | Fine for the MVP; say in the report that "accepted" and "edited" describe the review moment. If the report should also show "how much students changed AI steps afterwards", add an `edited` value to `task_event_type` in a later migration (Slice 5 or 9) and log title changes of AI steps with the old and new title (about 30 min). Already measurable without it: how many AI steps were completed, deleted or re-estimated |
| K2 | Reordering the steps in the review panel without changing them still counts as `accepted` | Fine; record in `decisions.md` §20 that order does not count as an edit |

## 3. Owner: checking the test task yourself

Open `npm run studio` (or the Neon console) and look at the "Library Management System" task of `arjun_manish7`:

1. **`ai_suggestions`** for that task: `prompt_version` is `breakdown.v2`, `output_valid` is true, `latency_ms` is a few thousand, `items_suggested` matches what the panel showed, `outcome` is `accepted` or `edited` (as you did it), `items_kept` is filled in, `resolved_at` is set, and the rating if you gave one.
2. **The steps** (`tasks` whose `parent_task_id` is that task): the ones from the AI have `source = ai_breakdown` and a suggestion id; any step you typed in the panel has `source = manual` and no suggestion id; the AI ones whose minutes you did not change have `estimate_source = ai`.
3. **The step dates:** if the task had a future deadline, they rise from today towards it, each at 23:59 your time (as shown on the page), the last one exactly at the task's deadline.
4. **`task_events`:** one `created` event per step.

If anything there looks different, send a screenshot and I will check it.

## 4. Test task checked (30 Oct 2026, Drizzle Studio, read-only)

"Library Management Software" of `arjun_manish7` (time zone Asia/Kolkata), deadline 2 Nov 2026 23:00 local:

| Check | Result |
|---|---|
| `ai_suggestions` | One row: `breakdown`, `llama3.2:3b`, `breakdown.v2`, `output_valid` true, 4382 ms, 9 suggested, 9 kept, `accepted`, `resolved_at` set, same user as the task owner, the raw answer holds 9 steps |
| Steps | 9 steps, all `source = ai_breakdown`, all linked to that suggestion, all `estimate_source = ai` (20 to 120 min), personal, same owner |
| Dates | 30 Oct x3, 31 Oct x2, 1 Nov x2 at 23:59 local, then the last two on 2 Nov at 23:00, the task's deadline (23:59 would have been after it). Rising, never after the deadline |
| `task_events` | One `created` for the task; one `created` per step (9), actor is the owner, `to_value = ai_breakdown` |

**Pass.** One harmless detail, no change needed: each step's `created_at` is 1 to 9 ms later than its `updated_at`, because `inBatch()` in `src/server/tasks/commands.ts` spaces a batch's `created_at` one millisecond apart to keep the steps in order (the manual steps made with the create form, from Slice 3, do the same). If anything ever reports "updated before created", set `updatedAt` to the same `inBatch()` value in both inserts (lines 190 and 307), 5 min.
