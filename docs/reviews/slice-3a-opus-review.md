# Slice 3, part 3a (schema): Opus review at checkpoint A

Reviewed 26 Oct 2026: `src/server/db/schema/tasks.ts`, `enums.ts`, `src/config/limits.ts`, `drizzle/0003_tasks.sql` and `tests/integration/tasks-schema.test.ts`, against `docs/slices/slice-3-plan.md` and `docs/data-model.md` §4. `tsc` and `eslint` pass.

**Verdict: approved, with the small additions below. Then start 3b.**

The tables match `data-model.md` §4 column for column. Every CHECK from the plan is there; the partial unique index allows subtasks of an assignment; the three future foreign keys are left out on purpose and documented; `task_events` reuses the append-only function with row and TRUNCATE triggers; and the schema test covers every constraint, including refusing a hard delete of a parent.

## 1. Add before the migration reaches Neon

**If `0003` has not been applied to Neon yet:** change the schema, delete `drizzle/0003_tasks.sql` and `drizzle/meta/0003_snapshot.json`, remove the `0003` entry from `_journal.json`, and generate `0003` again (keep the hand-written trigger part). **If it has already been applied:** never edit it; put the additions in `0004`. Tell the owner which one you did.

| ID | Addition | Why | Test |
|---|---|---|---|
| A1 | **Every timestamp comes from the app clock.** The commands in 3c must set `created_at` and `updated_at` (tasks) and `created_at` (task_events) explicitly from `now()`, not rely on the database's `DEFAULT now()` (keep the defaults as a fallback). Add CHECKs `started_at IS NULL OR started_at >= created_at` and `completed_at IS NULL OR completed_at >= created_at` | Today `created_at` comes from the database clock while `started_at`, `completed_at` and deadlines come from the app's `now()`. With a fixed test clock (or the Slice 5 seed), `completed_at - created_at` ("overall time") can come out negative, and the "When did you start?" window (between `created_at` and now) would be wrong. Slice 5's metrics depend on these timestamps agreeing | Schema test: both CHECKs refuse a bad row. In 3c: a command run under `setNowForTests` stores that exact instant in `created_at` |
| A2 | `(estimate_minutes IS NULL) = (estimate_source IS NULL)` | An estimate without a source (or the reverse) would confuse the estimate-accuracy metric and the "AI guess" label | Schema test |
| A3 | `resubmission_until IS NULL OR context = 'assignment'` | Only assignment tasks have resubmission windows (`data-model.md` §4) | Schema test |
| A4 | `deadline IS NULL OR original_deadline IS NOT NULL` | `original_deadline` is set the first time a deadline is set; the rescheduling metric relies on it | Schema test |
| A5 | `length(btrim(title)) > 0`, and `category_other IS NULL OR length(btrim(category_other)) > 0` | Today an empty or spaces-only title passes the database. Keep **maximum** lengths in Zod only, so the limits in `src/config/limits.ts` can change without a migration | Schema test |
| A6 | `context <> 'personal' OR deleted_reason IS NULL OR deleted_reason = 'user_deleted'` | The other two reasons belong to assignments only; a personal task with them would be excluded from metrics wrongly | Schema test |

One note for `decisions.md` §20: the estimate range (1 to 6,000 minutes) is written into the CHECK, so changing `TASK_ESTIMATE_MAX_MINUTES` later also needs a migration.

## 2. Enforced in code, not in the database (correct, test in 3c)

- A subtask's parent must be a top-level task (one level only).
- A subtask copies its parent's context, assignee, `assignment_id` and `team_id`.
- Rules R-a to R-i of the plan.

These need a lookup of another row, which a CHECK cannot do. A trigger could, but the commands are the only writers, so tests on the commands are enough.

## 3. Checkpoint A: the owner's confirmation of the plan's section 3

**Confirmed by the owner on 26 Oct 2026:** rules R-a to R-i are approved exactly as written in `docs/slices/slice-3-plan.md` §3. See `docs/reviews/slice-3b-opus-review.md` §1 for the list and where Sonnet records them.

## 4. Later, not now

Slice 5 will want an index on `tasks (assignee_id, completed_at)` for "tasks completed in this week". Add it in Slice 5 with the metric queries, when its benefit can be measured.
