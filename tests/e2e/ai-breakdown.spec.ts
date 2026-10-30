import { expect, test } from "@playwright/test";
import { createApprovedStudent, dateFromToday, expectNotFound, shot } from "./support";

// Flow 3 of 3 (CLAUDE.md "Tests"): a student breaks a task down with the AI, edits the suggestions, saves them,
// rates the breakdown, is told to wait before asking again, and discards a second suggestion. The model is a fixed
// fake (playwright.config.ts sets AI_FAKE_MODEL for this server, which src/env.ts allows on the test database
// only), so the flow does not need Ollama or a graphics card. The Admin cannot reach the student's task.

test("break a task down: edit the suggested steps, save them, rate, wait, discard", async ({ browser }) => {
  test.setTimeout(240_000);
  const { student, admin, close } = await createApprovedStudent(browser);

  // --- A task with a deadline in a week -----------------------------------------------------------
  await student.goto("/tasks/new");
  await student.getByLabel("Title").fill("Write lab report");
  await student.getByLabel("Deadline date (optional)").fill(dateFromToday(7));
  await student.getByRole("button", { name: "Create task" }).click();
  await expect(student).toHaveURL(/\/tasks$/);
  await student.getByRole("link", { name: "Write lab report" }).click();
  await expect(student.getByRole("heading", { name: "Steps" })).toBeVisible();
  await expect(student.getByText("No steps yet.")).toBeVisible();

  // --- Ask the AI ------------------------------------------------------------------------------------
  const breakDown = student.getByRole("button", { name: "Break this down" });
  await expect(breakDown).toBeEnabled();
  await shot(student, "ai-01-before");
  await breakDown.click();

  const review = student.getByRole("region", { name: "Suggested steps" });
  await expect(review).toBeVisible();
  await expect(review.getByText(/Suggested by AI\. Check them before saving\./)).toBeVisible();
  await shot(student, "ai-02-review");

  // The four suggested steps, with the dates the code worked out (the deadline's own day for the last one).
  await expect(review.getByLabel("Step 1", { exact: true })).toHaveValue("Review what the task asks for");
  await expect(review.getByLabel("Step 4", { exact: true })).toHaveValue("Check the result and finish");
  await expect(review.getByLabel("Due date")).toHaveCount(4);
  await expect(review.getByLabel("Due date").last()).toHaveValue(dateFromToday(7));

  // --- Edit: rename step 2, remove step 4, add one of my own, then save ---------------------------
  await review.getByLabel("Step 2", { exact: true }).fill("Plan the main parts (my words)");
  await review.getByRole("button", { name: "Remove step 4" }).click();
  await review.getByRole("button", { name: "Add a step" }).click();
  await review.getByLabel("Step 4 (added by you)").fill("Ask the lab assistant");
  await review.getByRole("button", { name: "Save steps" }).click();

  await expect(student.getByText("4 steps added.")).toBeVisible();
  await expect(student.getByRole("heading", { name: /Steps \(0 of 4 done\)/ })).toBeVisible();

  // The AI's steps are labelled in words; the one I added is not.
  const aiStep = student.getByRole("listitem").filter({ hasText: "Review what the task asks for" });
  await expect(aiStep.getByText("AI suggested")).toBeVisible();
  const edited = student.getByRole("listitem").filter({ hasText: "Plan the main parts (my words)" });
  await expect(edited.getByText("AI suggested")).toBeVisible();
  const mine = student.getByRole("listitem").filter({ hasText: "Ask the lab assistant" });
  await expect(mine).toBeVisible();
  await expect(mine.getByText("AI suggested")).toHaveCount(0);
  await shot(student, "ai-03-saved");

  // --- The optional rating --------------------------------------------------------------------------
  const rating = student.getByRole("region", { name: /How useful was this breakdown/ });
  await expect(rating).toBeVisible();
  await rating.getByRole("radio", { name: "4 stars" }).check({ force: true });
  await rating.getByLabel("Comment (optional)").fill("A good start");
  await rating.getByRole("button", { name: "Send" }).click();
  await expect(student.getByText("Thanks for the feedback.")).toBeVisible();
  await expect(rating).toHaveCount(0);

  // --- A second suggestion, after the 10-second pause between one person's requests ---------------
  // (Being told to wait is tested in the unit and permission tests; screens here are too slow to rely on it.)
  await student.waitForTimeout(11_000);
  await student.getByRole("button", { name: "Break this down" }).click();
  const second = student.getByRole("region", { name: "Suggested steps" });
  await expect(second).toBeVisible();

  // --- Discard: nothing is added ----------------------------------------------------------------------
  await second.getByRole("button", { name: "Discard" }).click();
  await expect(student.getByText("Suggestion discarded.")).toBeVisible();
  await expect(second).toHaveCount(0);
  await expect(student.getByRole("heading", { name: /Steps \(0 of 4 done\)/ })).toBeVisible();

  // --- The Admin cannot reach the student's task -----------------------------------------------------
  const href = new URL(student.url()).pathname;
  expect(href).toMatch(/^\/tasks\/[0-9a-f-]{36}$/);
  await admin.goto(href);
  await expectNotFound(admin);

  // --- A phone: the review panel is usable at 375 px wide -----------------------------------------
  await student.setViewportSize({ width: 375, height: 812 });
  await student.waitForTimeout(11_000);
  await student.getByRole("button", { name: "Break this down" }).click();
  const phoneReview = student.getByRole("region", { name: "Suggested steps" });
  await expect(phoneReview).toBeVisible();
  await expect(phoneReview.getByRole("button", { name: "Save steps" })).toBeVisible();
  await shot(student, "ai-04-phone-review");
  const overflow = await student.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);

  await close();
});
