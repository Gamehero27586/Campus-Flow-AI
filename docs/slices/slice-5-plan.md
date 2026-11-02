# Slice 5 plan: metrics, Growth Tracker (day and week), `seed:demo`

Written 30 Oct 2026 by Claude (Opus) for Claude (Sonnet), after Slice 4. The owner reviews this plan before you start. `docs/decisions.md` wins if anything here disagrees with it; if you find a disagreement, stop and ask.

**Read first:** `CLAUDE.md` (metric rules: definitions only in `src/server/metrics/definitions.ts`, thresholds only in `src/config/`), `docs/data-flows.md` §2 (the timestamp rules every metric depends on), **§7 (the only metric definitions)** and §8.2 step 3, `docs/decisions.md` §8 and §17 to §20, `docs/data-model.md` (`users.is_seed`, `users.timezone`, `tasks`, "Not stored on purpose"), `docs/permissions.md` (`tracker.personal.view`; the personal Growth Tracker is tier 1), `docs/mvp-scope.md` §9, `docs/folder-structure.md` (`/tracker`, `server/metrics/`, `scripts/seed-demo.ts`), and `docs/reviews/slice-4-opus-review.md`. Git stays the owner's job: never run a git command that changes anything.

---

## 1. Goal and exit check

**Goal:** a student opens **Growth** and sees, for this week or any earlier week, how many of the tasks due were finished, how many on time, how long tasks took, how good their estimates were and how often they moved deadlines, each compared with the week before when there is enough data, plus a plain sentence summary written by code. A **day** view shows today's counts. Every number comes from SQL on real rows. `npm run seed:demo` creates clearly labelled simulated students with about 12 weeks of history, so the tracker can be demonstrated.

**Exit check (`mvp-scope.md` §11: "Hand-calculated fixtures pass"):**
1. Every metric in `data-flows.md` §7.3 (except consistency and the month view, Slice 9) has a test against a **hand-calculated fixture** with a fixed clock, including the fixture in section 4a below, whose expected values are worked out by hand in this plan.
2. The week and day views show those numbers for the signed-in user only; nobody else can reach them (Admin and Faculty included).
3. `seed:demo` creates its simulated users once, their data shows the "Simulated data" banner, and their week view shows believable numbers with trends.
4. The `/tracker` page is in the coverage map and the matrix.
5. `typecheck`, `lint`, `test`, `test:e2e` and `npm audit` pass; the docs in section 8 are updated.

**No migration is expected.** The metrics are computed, not stored (`data-model.md`, "Not stored on purpose"), and the existing index `tasks (assignee_id, deadline)` serves the main query. Do not add an index unless a query is measured slow; if you think one is needed, stop and show the numbers.

**Estimate:** 30 to 45 hours.

## 2. Prerequisites (owner)

- Slice 4 committed and tagged.
- A shared password for the simulated users, saved as `SEED_DEMO_PASSWORD` in `.env.local` (never in Git), so you can sign in as one of them during a demo.

## 3. Proposed rules (confirm before 5a)

The documents leave these open. They are Opus's recommendations; build **only after the owner confirms them**, then record them in `decisions.md`.

| # | Case | Proposed rule | Why |
|---|---|---|---|
| M-a | What a trend compares | This timeframe against the **whole** previous one ("compared with last week"), including when this week is still running. The trend is shown only when **both** weeks have at least `TREND_MIN_COMPLETED_WEEK` (5) eligible tasks **completed inside the week** (by `as_of`). Otherwise: "Not enough finished tasks yet to compare (5 needed in both weeks)" | §7.3 says "completed eligible tasks" without saying which set; "finished inside the week" is what a student understands |
| M-b | On time | `completed_at <= deadline`, exactly as written. A date-only deadline is 23:59:00, so finishing at 23:59:30 is late. This matches the "Overdue" label the task pages already show | Simple and consistent; one comparison everywhere |
| M-c | Reopened and restored tasks in an ended week | The numbers follow the task's **current** state (latest `completed_at`, current deletion state). A task done on time, then reopened, stops counting as done in that ended week until it is done again. Change the sentence in §7.2 to: "An ended timeframe's numbers change only when one of its tasks is reopened, restored or deleted, or its deadline changes" | §2 keeps only the latest `completed_at`; rebuilding history from `task_events` would double the work for a rare case |
| M-d | Active time and estimate accuracy | "Active time" is **calendar time from start to finish** (nights included), not effort. The screen says so: "Time from start to finish". Estimate accuracy (median of active ÷ estimate per category) is shown only for a category with at least `ESTIMATE_ACCURACY_MIN_TASKS` = **3** such tasks in the week, worded "Took about 2.0× your estimate". Category `other` is one group whatever its custom label | Honest labelling; a ratio from one or two tasks means nothing. (The owner's own test task has an estimate of 4,320 minutes, which shows students sometimes estimate calendar time, sometimes effort) |
| M-e | Day view | Counts only (§7.3): **due today**, of those **done** (whenever they were done), of those **still open**, and **overdue** = not done, deadline already passed, **any** day. Deleted tasks are left out of the day view entirely (it is a to-do view, not history). Plus the bar "3 of 5 due today are done". Earlier days can be opened; for an ended day, "overdue" is as at the end of that day | Matches "3 of 5 due today are done"; a deleted task should not nag |
| M-f | Which weeks and days can be opened | From the week (or day) the account was created up to the current one. A future week, an invalid date, or a date before the account existed goes to the current one. Week links use the Monday: `/tracker?week=2026-10-26`; any other date is moved to its Monday. Day: `/tracker?day=2026-10-30`. Validated with Zod | No empty future pages; links can be shared with yourself and bookmarked |
| M-g | The plain-language summary | **In this slice: only the code-written part** (§8.2 step 3), shown when the week's due set has at least 3 tasks, for example "You finished 7 of the 9 tasks due this week (78%). 6 of them were on time. You moved deadlines 2 times." No model call and no `ai_suggestions` row; the model's suggestions and storing the summary are Slice 9 | Numbers stay code-only; the AI part keeps its own slice |
| M-h | A small history chart | Below the tiles: the **completion rate of the last 8 ended weeks plus this one**, as simple bars with the numbers written on them ("7 of 9"). A week with nothing due shows "nothing due", not 0%. Plain HTML or SVG with theme tokens, no chart library | "See growth" is checkpoint A's promise; one picture tells it better than one trend number |
| M-i | `seed:demo` behaviour | Creates **4 simulated students** with about **12 weeks** of history ending at the moment it runs, from a fixed random seed (same data shape every run). **Runs once per database:** refuses if any `is_seed` user exists ("Simulated users already exist. On the test database: `npm run db:reset`, then seed again"), because `task_events` is append-only and seed rows cannot be removed cleanly. Allowed on the test database; on the live database only with `--live` typed explicitly. Run it the day before a demo so "this week" is full | Append-only history makes a re-runnable seed impossible without breaking that rule; the `--live` flag stops an accident |
| M-j | Who and where | Route `/tracker` (name in the menu: **Growth**), key `tracker.personal.view` (Student by default; Faculty only if the Admin grants it, and then they see their own tasks). It always shows the **signed-in user's own** data: there is no user id anywhere in the URL or the queries' inputs. Admin can never hold the key (not eligible) | Tier 1 by construction, not by a check that could be forgotten |

## 4. What to build

### 4a. Timeframes and metric SQL with hand-calculated fixtures (about 12 to 16 h). **Show the owner the fixture results after this part.**

- `src/config/limits.ts`: add `ESTIMATE_ACCURACY_MIN_TASKS = 3`, `SUMMARY_MIN_DUE_TASKS = 3`, `HISTORY_WEEKS = 8` next to the trend minimums already there.
- `src/server/metrics/types.ts`: the result types (`WeekMetrics`, `DayCounts`, `Trend`), each rate carrying its numerator and denominator, never only a percentage.
- `src/server/metrics/timeframes.ts`: week and day bounds **in PostgreSQL**, as §7.5 asks (`date_trunc('week', …)` on the local time, then `AT TIME ZONE tz` back to UTC; reuse the approach of `localToUtc`). Input: the user's time zone, a local date, and `now` **from the app clock** (`src/lib/time.ts`), never SQL `now()`. Output: `start`, `end`, `asOf` (the earlier of now and end) and `isCurrent`. **[Verify]** first that PGlite (the test database) gives the same answer as Neon for a week that contains a daylight-saving change (see the tests).
- `src/server/metrics/definitions.ts`: **the only place** the rules of §7.1 and §7.3 are written, as SQL fragments with a comment citing the section: the eligible-task condition (top-level, assignee is the user, the deletion rule: `user_deleted` counts only if `completed_at <= deleted_at` or `deadline <= deleted_at`; `recipient_removed` and `assignment_cancelled` never), the due set (ended and current), and each metric. The **left-class rule** needs `class_members`, which arrives in Slice 6: write the rule's place as a clearly marked comment and a `todo` test in `later-slices.test.ts`, to be filled in with Slice 7.
- `src/server/metrics/queries.ts`:
  - `weekMetrics(actor, weekStarts[])`: **one SQL query** that returns the metrics for several weeks at once (this week, last week and the chart's weeks), so the page does not run nine queries one after another (`decisions.md` §21 item 2: pages are already slow).
  - `dayCounts(actor, localDate)`: one query.
  - Both take the user id **only** from the signed-in actor.
- `src/server/metrics/summary.ts`: the code-written sentences (M-g), a pure function of `WeekMetrics`, tested. No model.
- `src/lib/format-metrics.ts` (browser-safe): rates as whole percentages with the counts ("78%, 7 of 9"); durations as minutes under 90 minutes, hours under 48 hours, then days, one decimal at most; ratios as "2.0×"; trends in neutral words ("up 12 points from last week", "down 1.5 h"). No "good" or "bad" colour: for times, up is not clearly better or worse.

**The hand-calculated fixture** (write it as `tests/integration/metrics-fixture.test.ts`; keep the table below as a comment at the top so the owner can explain it in the viva). User U, time zone Asia/Kolkata, all times local, all personal top-level tasks unless stated. Fixed clock: **now = Wed 4 Nov 2026 15:00**. Week W = Mon 26 Oct 00:00 to Mon 2 Nov 00:00 (ended). Current week C = Mon 2 Nov 00:00 to `as_of` Wed 4 Nov 15:00.

| Task | Category, estimate | Created | Started | Completed | Deadline | Other |
|---|---|---|---|---|---|---|
| T1 | study, 60 | 26 Oct 09:00 | 26 Oct 10:00 | 26 Oct 12:00 | 27 Oct 23:59 | |
| T2 | study, 120 | 26 Oct 09:00 | 27 Oct 10:00 | 27 Oct 11:00 | 28 Oct 23:59 | rescheduled 1 |
| T3 | project, 90 | 27 Oct 08:00 | none | 29 Oct 08:00 | 29 Oct 08:00 | done exactly at the deadline |
| T4 | project, 600 | 27 Oct 09:00 | 30 Oct 09:00 | 31 Oct 13:00 | 30 Oct 23:59 | late; rescheduled 2 |
| T5 | reading, none | 25 Oct 10:00 | none | not done | 31 Oct 23:59 | To Do |
| T6 | study, none | 30 Oct 10:00 | 1 Nov 20:00 | 2 Nov 10:00 | 1 Nov 23:59 | finished after week W ended |
| T7 | study, none | 26 Oct 10:00 | none | not done | 29 Oct 23:59 | deleted 28 Oct (before the deadline): excluded |
| T8 | study, none | 26 Oct 10:00 | none | not done | 27 Oct 23:59 | deleted 29 Oct (after the deadline): counts |
| T9 | (step of T1) | 26 Oct 09:30 | 26 Oct 10:00 | 26 Oct 11:00 | 26 Oct 23:59 | a step: never counts |
| T10 | study, 30 | 26 Oct 10:00 | 28 Oct 09:00 | 28 Oct 10:00 | none | no deadline |
| T11 | study, 60 | 26 Oct 09:00 | 26 Oct 10:00 | 26 Oct 11:00 | 27 Oct 23:59 | **another user's** task: never counts |
| T12 | study, none | 26 Oct 10:00 | 28 Oct 10:00 | not done (reopened) | 29 Oct 23:59 | was done, then reopened (In progress) |
| T13 | study, none | 1 Nov 10:00 | 2 Nov 18:00 | 2 Nov 20:00 | 2 Nov 23:59 | |
| T14 | study, none | 1 Nov 10:00 | none | not done | 3 Nov 23:59 | overdue |
| T15 | study, none | 1 Nov 10:00 | none | not done | 4 Nov 23:59 | due later today |
| T16 | study, none | 1 Nov 10:00 | none | not done | 6 Nov 23:59 | due later this week |

Expected values, worked out by hand:

| Metric | Week W (ended) | Current week C |
|---|---|---|
| Due set | T1, T2, T3, T4, T5, T6, T8, T12 = **8** | T13, T14 = **2** (T15 and T16 are "still to come": **2**) |
| Completion rate | T1 to T4 done by Mon 2 Nov 00:00 = **4 of 8 = 50%** (T6 was done after the week ended) | **1 of 2 = 50%** |
| On-time rate | T1, T2, T3 (exactly at the deadline) on time, T4 late = **3 of 4 = 75%** | **1 of 1 = 100%** |
| Average active time | Done inside W with a start: T1 120, T2 60, T4 1,680, T10 60 min = 1,920 ÷ 4 = **480 min (8 h)** | T6 840, T13 120 = **480 min (8 h)** |
| Average overall time | Done inside W: T1 180, T2 1,560, T3 2,880, T4 6,000, T10 2,880 = 13,500 ÷ 5 = **2,700 min (45 h)** | T6 4,320, T13 2,040 = 6,360 ÷ 2 = **3,180 min (53 h)** |
| Estimate accuracy | study: T1 2.0, T2 0.5, T10 2.0, median **2.0×** (3 tasks, shown); project: T4 only (T3 has no start), **not enough data** | none |
| Rescheduling | (1 + 2) ÷ 8 = **0.375 moves per task** | 0 ÷ 2 = **0** |
| Finished inside the week (for trends, M-a) | T1, T2, T3, T4, T10 = **5** | T6, T13 = **2**, so **no trend** for C |

Day view for Wed 4 Nov at 15:00: due today **1** (T15), done **0**, still open **1**, overdue **3** (T5, T12, T14; T8 is deleted so it is left out, M-e).

**More tests, each with its own small hand-calculated example and a fixed clock** (§7.5): no tasks at all (every rate shows "no tasks were due", never 0% or NaN); a task without a deadline (never in the due set); each `deleted_reason` (the two assignment reasons by a direct insert once those tasks can exist; until then a `todo` test); a restored task; a reopened task done again late (`completed_at` is the latest, so it becomes late); the current week on a Wednesday (above); **a week containing a daylight-saving change** (user in Europe/London, week Mon 19 Oct 2026: the clocks go back on Sun 25 Oct, so the week is 169 hours; a task due Sun 25 Oct 23:30 London time is inside it, one due Mon 26 Oct 00:30 is not); a user in a time zone west of UTC (America/New_York) whose Monday starts on Monday at 04:00 or 05:00 UTC; a user who changed time zone (the weeks are recomputed in the new zone, accepted); the trend shown at exactly 5 and 5, hidden at 5 and 4; estimate accuracy at exactly 3 tasks and at 2; the history query returning 9 weeks with a "nothing due" week among them; and the day view for an ended day.

### 4b. The Growth Tracker page (about 8 to 12 h)

- `/tracker` (`src/app/(app)/tracker/page.tsx`): `requirePermission("tracker.personal.view")`, then the queries for the signed-in user. Tabs **Day** and **Week** (no Month tab until Slice 9). Arrows for the previous and next week or day, and a "This week" or "Today" link (M-f). The heading names the dates in words: "Week of 26 Oct to 1 Nov 2026".
- **Week view:** one tile per metric (completion, on time, time from start to finish, time from creating to finishing, deadline moves) with the value, the counts it came from, and the trend or the reason there is none; the estimate-accuracy table per category (M-d); "Still to come this week: 2 tasks" for the current week; the code-written summary (M-g); the 9-week chart (M-h). An empty week says what is missing in words: "No tasks were due this week", with a link to `/tasks`.
- **Day view:** the four counts and the bar (M-e), with a link to the tasks list.
- **"Simulated data" banner** at the top whenever the signed-in user is a seed user (`is_seed`), on `/tracker`, `/tasks` and the task pages: "Simulated data: this account and its tasks were generated for the demonstration" (`mvp-scope.md` §9).
- Small explanations under each tile (a short line, not a pop-up), for example "Tasks due this week that you finished by now". A student who asks "why 50%?" should find the answer on the page.
- The menu gets **Growth** after Tasks, shown only to holders of the key. Replace the dashboard's placeholder line ("…your Growth Tracker arrive in the next slices") with a short link to Growth; the real student dashboard is Slice 8.
- Theme tokens only, no raw colours; nothing that relies on colour alone; works at 375 px width without sideways scrolling; checked in both themes.

### 4c. `seed:demo` (about 6 to 9 h)

- `scripts/seed-demo.ts` (`npm run seed:demo`), as in M-i. It refuses to run when `SEED_DEMO_PASSWORD` is missing, when any `is_seed` user already exists, or on the live database without `--live` (reuse `databaseIdentity` from `scripts/lib/test-database-guard.ts` to recognise it). It never deletes anything.
- **4 simulated students** with clear names and `@example.test` addresses (for example `demo_asha`, `demo_rohan`, `demo_meera`, `demo_kabir`), `is_seed = true`, status `active`, role Student, a username (the welcome step done), time zone Asia/Kolkata, and a credential account whose password is `SEED_DEMO_PASSWORD`, hashed the same way Better Auth hashes a sign-up. **[Verify]** the hashing function Better Auth exports for this in the installed version (`node_modules/better-auth`), and test that a seed user can sign in.
- **Personas with a story** for the demo: one steady (high completion and on-time), one last-minute (finishes late in the day, often just after deadlines), one **improving** (completion rising over the 12 weeks, so the chart and the trend show growth), one overloaded (many tasks, many deadline moves). About 6 to 12 top-level tasks per week each, spread over all categories, some with steps (steps never count, but they make the task pages look real), some with estimates, some without a deadline, a few deleted, a few reopened, some due later this week.
- The rows must obey **every rule and CHECK** the app obeys: `created_at <= started_at <= completed_at`, `original_deadline` set, `reschedule_count` matching the `deadline_changed` events written, status matching `completed_at`, and one `task_events` row for every change the history implies (created, status changes, completed, deadline changed, deleted, reopened), with plausible timestamps. Use a seeded random generator (seed 42) so a re-run on a fresh database gives the same shape.
- After inserting, the script prints a short report per user: tasks, done, on-time rate this week and last week, so the owner can see at once that the story is there.
- Tests: on PGlite, the script's core function creates 4 seed users and no other rows; every seed task passes the CHECKs (the database does this) **and** a consistency check (events agree with the columns); a second run refuses; a seed user can sign in; the improving persona's completion rate over the first 4 weeks is lower than over the last 4.

### 4d. Permissions, the Admin label, docs and the browser flow (about 3 to 5 h)

- `coverage.test.ts`: `/tracker` with `tracker.personal.view`. `actions-matrix.test.ts` (or the page rows that the matrix uses): Student allowed; Faculty without the grant refused (`missing_permission`); Faculty with the grant sees **their own** numbers; Admin refused; a pending or deactivated user refused. A test that two students with tasks in the same week each see only their own counts.
- The Admin **Users** page shows a small "Simulated" label next to seed users, so they are never mistaken for real students during the friends test.
- `later-slices.test.ts`: turn the Growth Tracker placeholders into real tests where they now apply (permissions.md §9: "the Growth Tracker half waits for Slice 5"); keep the left-class and assignment-reason cases as `todo` for Slice 7.
- Extend `tests/e2e/personal-tasks.spec.ts` by a few lines (do not add a fourth flow): after completing the task, open **Growth**, see "1 of 1" for today's due tasks, and check that the Admin gets "not found" or no menu item for `/tracker`.

## 5. Out of scope

The month view and consistency, the AI part of the weekly summary, storing summaries, and the estimate hint (Slice 9); the student, faculty and admin dashboards (Slice 8); the class tracker (Slice 8); the left-class rule's data (Slices 6 and 7); caching or a metrics table (only if measured slow); any export. If something here seems to need one of these, stop and ask.

## 6. How to work through it

1. **Owner confirms M-a to M-j** (section 3), or says which to change. Record them in `decisions.md` before writing code.
2. **4a**, then show the owner the fixture test passing, the expected-value table above, and one real week of the owner's own test account in plain numbers. The definitions are the heart of the slice; the screens only display them.
3. 4b, 4c, 4d. After each part: run `typecheck`, `lint` and `test`; list the changed files; say what to look at in the browser (an empty week, a full week, a seed user). The owner commits each part.
4. At the end: the full checks (`test`, `test:e2e` twice a minute apart, `npm audit`) and the docs below. No security review is due (`CLAUDE.md`: after Slices 1, 2 and 7); ask Opus for a final review of the slice.

## 7. Security and privacy checks for this slice

- The tracker reads the user id **only** from the session. No query parameter, form field or route segment names a user. A test passes another user's id in every way the page accepts input (it accepts only `week` and `day`) and still gets the signed-in user's own numbers.
- `week` and `day` are validated with Zod and passed to SQL as parameters; the time zone comes from the user's row (already validated by `isValidTimeZone`), never from the request.
- Tier 1: no Admin path, no Faculty path (faculty see their own tasks only, and only with the grant).
- `seed:demo` never deletes, refuses a second run, refuses the live database without `--live`, and keeps its password out of Git. Seed users are labelled everywhere they appear (tracker, tasks, Admin Users page).
- The summary is code-written; no model output is shown on this page in this slice.

## 8. Documents to update in this slice

- `decisions.md`: a new **§21 Slice 5 notes** before "Still open" (which becomes §22): the confirmed rules M-a to M-j, the PGlite daylight-saving check, the one-query design, the seed personas, and how to run `seed:demo` before a demo.
- `data-flows.md` §7: the sentence from M-c in §7.2; M-a in the Trend row; M-d's wording and minimum; M-e for the day view; remove the **[Verify]** in §7.5 once checked.
- `data-model.md`: confirm "no new table or column" for Slice 5 (one line), and that seed users are created only by `seed:demo`.
- `folder-structure.md`: `server/metrics/` as built, `/tracker`, `scripts/seed-demo.ts`, `SEED_DEMO_PASSWORD`.
- `permissions.md` §9: the Growth Tracker cases now covered.
- `mvp-scope.md` §11: nothing changes; tick Slice 5 in `README.md` if the slices are tracked there.
