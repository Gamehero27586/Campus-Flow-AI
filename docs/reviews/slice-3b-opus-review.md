# Slice 3, part 3b (time handling): Opus review

Reviewed 26 Oct 2026: `src/server/tasks/time.ts`, `src/lib/time.ts`, `src/config/limits.ts`, the regenerated `drizzle/0003_tasks.sql`, `tests/integration/local-to-utc.test.ts`, `tests/unit/local-time.test.ts` and `tests/integration/tasks-schema.test.ts`. `tsc` and `eslint` pass.

**For Sonnet:** do section 1 first (record the owner's confirmation), then the fix in section 3, then continue with 3c. Never run a git command that changes anything.

---

## 1. Owner's confirmation (26 Oct 2026): rules R-a to R-i are approved

The owner confirmed all nine rules in `docs/slices/slice-3-plan.md` §3 **exactly as written**, with no changes:

- **R-a** Starting a subtask while its parent is To Do also starts the parent (`started_at`, its own `status_changed` event).
- **R-b** No new subtasks on a Done parent ("Reopen the task to add steps").
- **R-c** No reopening a subtask of a Done parent ("Reopen the task first").
- **R-d** A subtask has a title, status, optional deadline and optional estimate; category and priority are copied from the parent and follow it.
- **R-e** A subtask deadline after the parent's is allowed, with a warning on the form.
- **R-f** Deleting a parent soft-deletes its subtasks with it (same `deleted_at` and reason, one `deleted` event each).
- **R-g** Restoring a parent restores the subtasks deleted at the same moment only; restoring a subtask whose parent is still deleted is refused ("Restore the task first").
- **R-h** Restoring clears `deleted_at` and `deleted_reason` and writes a `restored` event; the task then counts normally in metrics.
- **R-i** Limits: title 1 to 200 characters, description up to 5,000, custom category label 1 to 40, estimate 1 to 6,000 minutes, at most 30 subtasks per task.

Record them now: in `decisions.md` §20 (Slice 3 notes) as "confirmed by the owner on 26 Oct 2026", and in `data-flows.md` §2 (the table and the edge-case list). Build 3c on them; no further confirmation is needed.

## 2. Verdict on 3a and 3b

**3a additions: all applied.** `0003` was regenerated (not yet applied to Neon) with A1's two CHECKs (`started_at >= created_at`, `completed_at >= created_at`) and A2 to A6. The other half of A1 (commands stamp `created_at` and `updated_at` from `now()`) belongs to 3c; see section 4.

**3b: approved, with one fix.** Good work:
- The local-to-UTC conversion runs in PostgreSQL (`(date + time) AT TIME ZONE zone`), with no hand-written offset arithmetic and no new library. It takes a transaction as its runner, and the inputs are passed as parameters (a test proves a time zone name cannot change the SQL).
- A date without a time becomes 23:59 local (`DEFAULT_DEADLINE_TIME`). The tests cover India, London's daylight-saving changes in both directions, New York, a non-existent and a repeated local time, 29 February and midnight edges.
- The display (`formatDeadline`) always shows the time, so a date-only deadline visibly says 23:59; it adds the year only when it is not the current year. `isOverdue` is calculated and is false at the exact deadline instant (matching "on time = at or before the deadline").
- The estimate limits note in `limits.ts` (changing them needs a migration too).

## 3. Fix before 3c: bare offsets mean opposite things in Node and PostgreSQL

**Found by running both, 26 Oct 2026.** Node's `Intl` accepts a bare offset such as `+05:30` or `-03:00` as a time zone and reads it as **east** of UTC (the ISO 8601 meaning). PostgreSQL's `AT TIME ZONE` reads the same string the POSIX way, as **west** of UTC:

| Time zone string | PostgreSQL: 12:00 local on 2 Nov is | Node `Intl`: 12:00 UTC shows as |
|---|---|---|
| `Asia/Kolkata` | 06:30 UTC (correct) | 17:30 (correct) |
| `+05:30` | **17:30 UTC** (5½ h *west*) | 17:30 (5½ h *east*) |
| `-03:00` | **09:00 UTC** (3 h *east*) | 09:00 (3 h *west*) |
| `Etc/GMT+5` | 17:00 UTC | 07:00 (both read it as UTC−5, consistent) |

So a user whose time zone is stored as `+05:30` would see every deadline 11 hours away from what they entered. The settings dropdown only offers named zones, but `timezoneSchema` (in `src/lib/schemas/settings.ts`) and `isValidTimeZone` (in `src/lib/time.ts`) accept anything `Intl` accepts, so a hand-made request to the settings action can store a bare offset today.

**Change:**
- One `isValidTimeZone`, in `src/lib/time.ts`. Remove the duplicate in `src/lib/schemas/settings.ts` and import the shared one. It accepts **only IANA names**: refuse any value that starts with `+` or `-`, and any value without a letter. `UTC` stays allowed. Named zones such as `Etc/GMT+5` stay allowed, because both systems agree on them.
- `localToUtc` keeps its check and therefore refuses bare offsets too.
- **Tests:** `+05:30`, `-03:00` and `+0530` are refused by the settings action (add the row to `actions-matrix.test.ts`) and by `localToUtc`; `Asia/Kolkata`, `Asia/Calcutta`, `UTC` and `Etc/GMT+5` are accepted. Add the `+05:30` row from the table above as a comment in the test, so the reason is not lost.

Effort: about 30 minutes.

## 4. Things 3c must do (carried over)

1. **A1, second half:** every command sets `created_at` and `updated_at` (tasks) and `created_at` (task_events) from `now()` explicitly. Test: under `setNowForTests`, a created task and its `created` event store exactly that instant.
2. **Deadline range:** the task form's Zod schema should accept only deadlines in a sensible range (for example the years 2000 to 2100), so a mistyped year such as 20266 or 0202 is refused with a field message instead of reaching the database.
3. **"When did you start?"** uses the same `localToUtc` conversion and is refused outside the window from `created_at` to `completed_at` (and never later than `now()`).
4. Rules R-a to R-i (section 1), with their tests.
