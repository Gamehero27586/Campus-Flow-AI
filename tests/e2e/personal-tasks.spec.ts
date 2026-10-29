import { expect, test } from "@playwright/test";
import { createApprovedStudent, dateFromToday, expectNotFound, shot } from "./support";

// Flow 2 of 3 (CLAUDE.md "Tests"): a student makes a task with two steps, starts a step and sees the
// task start with it, completes everything, deletes the task and brings it back with Undo. On a phone the
// same form is a page. The Admin cannot open the student's task.

test("create a task with steps, start a step, complete all, delete and Undo", async ({ browser }) => {
  // A long flow, and every screen takes a few seconds on the shared test database (see decisions.md §20).
  test.setTimeout(240_000);
  const { student, admin, close } = await createApprovedStudent(browser);

  // --- The menu and the empty list --------------------------------------------------------------
  const menu = student.getByRole("navigation", { name: "Main" });
  await menu.getByRole("link", { name: "Tasks" }).click();
  await expect(student).toHaveURL(/\/tasks$/);
  await expect(student.getByText("Add your first task")).toBeVisible();
  await shot(student, "01-empty");

  // --- Settings has a Back button: it goes back to where the person came from, else to their home ---
  await student.getByRole("button", { name: /Account menu for/ }).click();
  await student.getByRole("link", { name: "Settings" }).click();
  await expect(student).toHaveURL(/\/settings$/);
  await student.getByRole("link", { name: "Back" }).click();
  await expect(student).toHaveURL(/\/tasks$/);
  await student.goto("/settings");
  await student.getByRole("link", { name: "Back" }).click();
  await expect(student).toHaveURL(/\/dashboard$/);
  await student.goto("/tasks");

  // --- A wide screen: "New task" is a pop-up ------------------------------------------------------
  await student.getByRole("link", { name: "New task" }).click();
  const dialog = student.getByRole("dialog", { name: "New task" });
  await expect(dialog).toBeVisible();
  await expect(student).toHaveURL(/\/tasks$/);

  await dialog.getByLabel("Title").fill("Write lab report");
  await dialog.getByLabel("Deadline date (optional)").fill(dateFromToday(7));
  await dialog.getByRole("button", { name: "Add a step" }).click();
  await dialog.getByLabel("Step 1", { exact: true }).fill("Outline");
  await dialog.getByRole("button", { name: "Add a step" }).click();
  await dialog.getByLabel("Step 2", { exact: true }).fill("Draft");
  await shot(student, "02-new-task-dialog");
  await dialog.getByRole("button", { name: "Create task" }).click();

  await expect(student.getByText("Task created.")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const card = student.getByRole("listitem").filter({ hasText: "Write lab report" });
  await expect(card).toBeVisible();
  await expect(card.getByText("To Do", { exact: true })).toBeVisible();
  await shot(student, "03-list");

  // --- Starting a step starts the task with it, and says so ------------------------------------
  // The whole card opens the task, not only the title (a tap anywhere on a phone). Click a spot on the card away
  // from the title and the Start button (the link's invisible layer covers the card, so click by position).
  await card.click({ position: { x: 300, y: 70 } });
  await expect(student).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(student.getByRole("heading", { name: "Write lab report" })).toBeVisible();
  await expect(student.getByRole("heading", { name: "Steps" })).toBeVisible();

  const outline = student.getByRole("listitem").filter({ hasText: "Outline" });
  await outline.getByRole("button", { name: "Start" }).click();
  await expect(student.getByText("Step started. The task was started with it.")).toBeVisible();
  // The task itself is now In progress: its own badge in the header.
  await expect(student.locator("header").getByText("In progress", { exact: true })).toBeVisible();
  await shot(student, "04-detail-step-started");

  // A step row opens the step the same way; its Back button has a short, fixed label.
  await outline.click({ position: { x: 300, y: 40 } });
  await expect(student.getByText("Step of: Write lab report")).toBeVisible();
  await expect(student.getByRole("link", { name: "Back to parent task" })).toBeVisible();
  await student.getByRole("link", { name: "Back to parent task" }).click();
  await expect(student.getByRole("heading", { name: "Steps" })).toBeVisible();

  // --- Mark done: "2 steps are not done. Complete them too?" ------------------------------------
  await student.getByRole("button", { name: "Mark done" }).first().click();
  const confirm = student.getByRole("dialog", { name: /steps are not done/ });
  await expect(confirm).toBeVisible();
  await shot(student, "05-complete-all");
  await confirm.getByRole("button", { name: "Complete all" }).click();
  await expect(student.getByText("Marked done.")).toBeVisible();
  await expect(student.locator("header").getByText("Done", { exact: true })).toBeVisible();
  // A Done task's deadline is locked until it is reopened.
  await expect(student.getByText("Reopen the task to change its deadline.")).toBeVisible();
  await expect(student.getByRole("button", { name: "Change deadline" })).toHaveCount(0);

  // --- Delete, then Undo ------------------------------------------------------------------------
  await student.getByRole("button", { name: "Delete task" }).click();
  await expect(student).toHaveURL(/\/tasks$/);
  const undo = student.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(student.getByText("Task restored.")).toBeVisible();

  await student.goto("/tasks?filter=done");
  await expect(student.getByRole("listitem").filter({ hasText: "Write lab report" })).toBeVisible();

  // Deleting again, this time restoring later from the Deleted list.
  await student.getByRole("link", { name: "Write lab report" }).click();
  await student.getByRole("button", { name: "Delete task" }).click();
  await expect(student).toHaveURL(/\/tasks$/);
  await student.getByRole("link", { name: "Deleted tasks" }).click();
  // The task and its two steps were deleted together: one row for the task, with the steps inside it
  // (they have no rows or Restore buttons of their own).
  const deletedItem = student.getByRole("listitem").filter({ hasText: "Write lab report" });
  await expect(deletedItem).toHaveCount(1);
  await expect(deletedItem.getByText(/Deleted with 2 steps: .*Outline.*Draft|Deleted with 2 steps: .*Draft.*Outline/)).toBeVisible();
  await expect(student.getByRole("listitem")).toHaveCount(1);
  await shot(student, "06-deleted");
  await deletedItem.getByRole("button", { name: "Restore" }).click();
  await expect(student.getByText("Task restored.")).toBeVisible();
  await expect(student.getByRole("listitem").filter({ hasText: "Write lab report" })).toHaveCount(0);

  // --- The Admin cannot open the student's task -------------------------------------------------
  await student.goto("/tasks?filter=done");
  const href = await student.getByRole("link", { name: "Write lab report" }).getAttribute("href");
  expect(href).toMatch(/^\/tasks\/[0-9a-f-]{36}$/);
  await admin.goto(href!);
  await expectNotFound(admin);
  await admin.goto("/tasks");
  await expectNotFound(admin);
  await expect(admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Tasks" })).toHaveCount(0);

  // --- A phone: "New task" is its own page, and a never-started task asks "When did you start?" ---
  await student.setViewportSize({ width: 375, height: 812 });
  await student.goto("/tasks");
  await student.getByRole("link", { name: "New task" }).click();
  await expect(student).toHaveURL(/\/tasks\/new$/);
  await shot(student, "07-phone-new-task");
  await student.getByLabel("Title").fill("Read chapter 4");
  await student.getByRole("button", { name: "Create task" }).click();
  await expect(student).toHaveURL(/\/tasks$/);

  await student.getByRole("link", { name: "Read chapter 4" }).click();
  await student.getByRole("button", { name: "Mark done" }).click();
  const startPrompt = student.getByRole("dialog", { name: "When did you start?" });
  await expect(startPrompt).toBeVisible();
  await shot(student, "08-phone-when-did-you-start");
  // A start before the task was created is refused, with the reason, and the dialog stays open.
  await startPrompt.getByLabel("Date").fill(dateFromToday(0));
  await startPrompt.getByLabel("Time").fill("00:00");
  await startPrompt.getByRole("button", { name: "Save start time" }).click();
  await expect(startPrompt.getByText(/cannot be before the task was created/)).toBeVisible();
  await startPrompt.getByRole("button", { name: "Skip" }).click();
  await expect(startPrompt).toHaveCount(0);
  await expect(student.getByText("Not started")).toBeVisible();

  // Only when looking at the screens (E2E_SCREENSHOTS is set): the same pages in dark mode, on a laptop.
  if (process.env.E2E_SCREENSHOTS) {
    await student.context().addCookies([{ name: "theme", value: "dark", url: "http://localhost:3100" }]);
    await student.setViewportSize({ width: 1280, height: 800 });
    await student.goto("/tasks?filter=all");
    await shot(student, "09-dark-list");
    await student.getByRole("link", { name: "Read chapter 4" }).click();
    await expect(student.getByRole("heading", { name: "Read chapter 4" })).toBeVisible();
    await shot(student, "10-dark-detail");
  }

  await close();
});
