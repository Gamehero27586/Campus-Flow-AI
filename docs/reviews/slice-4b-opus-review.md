# Slice 4, part 4b (the `ai_suggestions` migration): Opus review

Reviewed 30 Oct 2026: `drizzle/0004_ai_suggestions.sql`, `src/server/db/schema/ai.ts`, the changes to `tasks.ts` and `enums.ts`, and `tests/integration/ai-suggestions-schema.test.ts` (about 27 cases). `tsc` passes. **Migration `0004` has not been applied to Neon yet. Do not apply it until the additions below are in.** Change the schema and **regenerate** `0004` (delete `0004_ai_suggestions.sql` and `meta/0004_snapshot.json` and the `0004` entry in `_journal.json`, then `db:generate`), since it has never been applied.

**For Sonnet:** apply B1 to B5, regenerate `0004`, run the schema tests, do the check in B6 on Neon, then apply. Never run a git command that changes anything.

---

## 1. Verdict

**Approved with five small additions.** The table matches `data-model.md` §8 and the plan; every planned CHECK is there and tested; the foreign key from `tasks.ai_suggestion_id` promised in Slice 3 is added, together with `(source = 'ai_breakdown') = (ai_suggestion_id IS NOT NULL)`; timestamps come from the app clock; the summary's unique index is rightly left for Slice 9. The circular reference between `tasks` and `ai_suggestions` is handled correctly (the foreign key is added after both tables exist).

## 2. Additions (CHECKs that make AI-f, AI-g and AI-h true in the database too)

| ID | Addition | Why |
|---|---|---|
| B1 | In `ai_suggestions_kind_shape`, a summary also has `task_id IS NULL` | A summary is about a week or month, never one task |
| B2 | `outcome NOT IN ('accepted', 'edited') OR output_valid = true` | Only a valid answer can be saved (the exit check "invalid output never saved", now also in the database) |
| B3 | `items_kept IS NULL OR outcome IN ('accepted', 'edited')`, and `outcome <> 'accepted' OR items_kept = items_suggested` | AI-g: items are kept only when steps were saved; AI-f: "accepted" means saved exactly as suggested, so everything suggested was kept |
| B4 | `(rating IS NULL AND feedback_text IS NULL) OR outcome IN ('accepted', 'edited')` | AI-h: the rating and comment come after saving, never on a discarded or failed suggestion |
| B5 | `feedback_text IS NULL OR length(btrim(feedback_text)) > 0` | No empty comments (the same rule as task titles) |

Each needs a schema test (one allowed and one refused row).

## 3. Before applying to Neon

| ID | Check |
|---|---|
| B6 | The new CHECK on `tasks` must hold for the rows already on Neon. Run `SELECT count(*) FROM tasks WHERE source <> 'manual' OR ai_suggestion_id IS NOT NULL;` in the Neon console (or `npm run studio`): it must be **0**. It should be, because no code has created AI steps yet. If it is not 0, stop and tell the owner |

## 4. Notes (no change now)

- That a step's suggestion belongs to the **same user and the same parent task** cannot be a CHECK (it needs another table). `createStepsFromBreakdown` in 4c must check it inside its transaction, with a test.
- `ai_suggestions` is updated (outcome, rating), so it is not append-only like `task_events`. That is correct.
- The current prompt is still `breakdown.v1`; the owner picks v1 or v2 after scoring the seeded runs. This does not affect the migration.
