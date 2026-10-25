import { expect, test } from "@playwright/test";
import { adminLogin, expectNotFound, newTestAccount, signIn, signUp, visit } from "./support";

// Flow 1 of 3 (CLAUDE.md "Tests"): a new person signs up, is held until an Admin approves them, and
// then sees only what a student may see.

test("sign up, wait for approval, get approved by the Admin, and see only student pages", async ({
  browser,
}) => {
  const account = newTestAccount();

  // --- The new person: sign up, sign in, choose a username -------------------------------------
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();

  await signUp(student, account);
  // Sign-up does not sign anyone in: it goes to the sign-in page with a toast.
  await expect(student).toHaveURL(/\/sign-in$/);
  await expect(student.getByText(/Sign-up complete/)).toBeVisible();

  await signIn(student, account.email, account.password);
  await expect(student).toHaveURL(/\/welcome$/);
  await student.getByLabel("Username").fill(account.username);
  await student.getByRole("button", { name: "Continue" }).click();

  await expect(student).toHaveURL(/\/pending$/);
  await expect(student.getByText("Waiting for approval")).toBeVisible();

  // --- Pending means held: the app and the Admin pages send them straight back ---------------
  expect(await visit(student, "/dashboard")).toBe("/pending");
  expect(await visit(student, "/admin/users")).toBe("/pending");
  expect(await visit(student, "/settings")).toBe("/pending");

  // --- The Admin approves them -----------------------------------------------------------------
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const login = adminLogin();
  await signIn(admin, login.email, login.password);
  await expect(admin).toHaveURL(/\/dashboard$/);

  await admin.goto("/admin/users?status=pending");
  const row = admin.getByRole("row", { name: new RegExp(account.email) });
  await expect(row).toBeVisible();
  // The email was never verified, so the Admin has to confirm they checked it.
  await row.getByRole("checkbox").check();
  await row.getByRole("button", { name: "Approve" }).click();
  // The row leaves the pending list once the approval is saved.
  await expect(row).toHaveCount(0);

  await admin.goto("/admin/users?status=active");
  const activeRow = admin.getByRole("row", { name: new RegExp(account.email) });
  await expect(activeRow).toBeVisible();
  await expect(activeRow.getByText("Student", { exact: true })).toBeVisible();

  // --- Now the student gets in, but only to student pages ---------------------------------------
  expect(await visit(student, "/pending")).toBe("/dashboard");
  await expect(student.getByRole("heading", { name: /Hello/ })).toBeVisible();

  // A student opens the Admin pages: "not found", not "forbidden".
  await student.goto("/admin/users");
  await expectNotFound(student);
  await student.goto("/admin/roles");
  await expectNotFound(student);

  // The menu shows no Admin links.
  await student.goto("/dashboard");
  const menu = student.getByRole("navigation", { name: "Main" });
  await expect(menu.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Roles" })).toHaveCount(0);

  await studentContext.close();
  await adminContext.close();
});
