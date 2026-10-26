# Slice 3, the time-zone fix and part 3c (rules and commands): Opus review

Reviewed 27 Oct 2026: `src/lib/time.ts`, `src/lib/schemas/settings.ts`, `src/lib/schemas/tasks.ts`, `src/server/tasks/policy.ts`, `queries.ts`, `commands.ts`, `src/app/(app)/tasks/actions.ts`, and the tests (`tasks-commands.test.ts` with 70 cases, `tasks-queries.test.ts`, `tests/unit/tasks/`, the permission matrix and coverage rows). `tsc` and `eslint` pass. The owner runs `npm run test`.

**For Sonnet:** apply C1 now. Apply C2 only if the owner says yes. Then continue with 3d. Never run a git command that changes anything.

---

## 1. Verdict

**Safe to commit tonight. Two small items before 3d.**

**The time-zone fix is correct.** One `isValidTimeZone` in `src/lib/time.ts`, now also used by the settings schema, refuses bare offsets (`+05:30`, `-03:00`, `+0530`, `0530`) and anything without a letter. It is tested in the unit tests, in `localToUtc` and in the settings action matrix, with the reason written in the test.

**3c is very good:**
- **Privacy (tier 1):** every loader and every command scopes to `context = 'personal' AND assignee_id = user`, in the query, and the relationship rule checks it again. No Admin path exists. Another student's task, an unknown id and the same student's assignment task are all "not found", tested for every command.
- **Concurrency:** each command locks the parent first, then the task (then the steps), so two commands cannot deadlock, and re-runs the rules on the locked row. The two-tab cases are tested, including "two commands at the same moment: only one wins".
- **Timestamps:** one `now()` per command stamps `created_at`, `updated_at`, `completed_at`, `started_at` and every event (review A1), tested with a fixed clock.
- **Every rule in `data-flows.md` §2 and R-a to R-i has a test**, including the edge cases (done, reopened, done again; todo straight to done; complete all; earlier and later deadlines; the "When did you start?" window at its exact edges).
- **Two sensible additions:** a deadline can be moved but never removed (removing it would take a late task out of the metrics), and a step that is not done cannot be restored into a Done parent.
- Deadline years are limited to a sensible range in the form schema.

## 2. Before 3d

| ID | Finding | Change | Test | Effort |
|---|---|---|---|---|
| C1 | **A Done task's deadline can still be changed, which rewrites history.** `changeDeadlineRules` checks only "not deleted". A student who finished a task late can move its deadline past the finish afterwards, and the task becomes "on time" in the Growth Tracker. `reschedule_count` goes up, but the on-time rate is still rewritten without the task being redone | Add to `changeDeadlineRules`: refuse when the task is Done, "Reopen the task to change its deadline." (Reopening clears `completed_at`, so a later finish is measured honestly against the new deadline, as `data-model.md` rule 5 intends.) Apply it to steps too, for consistency | A Done task's deadline change is refused and nothing changes; after reopening it is allowed | 20 min |
| C2 | **Owner's decision.** R-a covers *starting* a step. Completing a step straight from To Do (skipping Start) while the parent is To Do leaves the parent To Do with no `started_at`, although work clearly happened | **If the owner agrees:** completing a step while the parent is To Do also moves the parent to In progress and sets its `started_at` (same instant, its own `status_changed` event), exactly like R-a. Record it as rule **R-a2** in `decisions.md` §20 and `data-flows.md` §2. **If not:** leave it, and note in `decisions.md` that only Start moves the parent | Completing a step of a To Do parent starts the parent; a parent already in progress is left alone | 20 min |

## 3. Notes for later (no action now)

- `commands.ts` re-runs the rules with an empty permission set, which is correct because no task rule reads permissions (the same note as `admin/commands.ts` in the Slice 2 review). If a future task rule needs a permission, pass the real set.
- `getMyTask` also returns a deleted task (with `deletedAt` set). The 3d detail page must treat a deleted task as "this task is deleted" with a Restore button, or as "not found", and never show its normal action buttons. Add a test when the page is built.
