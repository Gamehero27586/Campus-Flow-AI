import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// No password or personal email is written in the repository. The Admin the flows sign in as comes
// from .env.local (git-ignored): E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD. It is an Admin account on the
// TEST database (docs/decisions.md §18). Every new test student gets a random password.

/** Test accounts made by browser tests use this email domain, so they are easy to recognise. */
export const TEST_EMAIL_DOMAIN = "example.test";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is missing. Add it to .env.local (see .env.example): the end-to-end flows sign in as an Admin on the test database.`,
    );
  }
  return value;
}

export const adminLogin = () => ({
  email: required("E2E_ADMIN_EMAIL"),
  password: required("E2E_ADMIN_PASSWORD"),
});

/** A new, unique test account every run, with a random password. */
export function newTestAccount() {
  const stamp = `${Date.now()}`;
  return {
    name: "E2E Student",
    email: `e2e-${stamp}@${TEST_EMAIL_DOMAIN}`,
    // 3 to 20 characters, letters and numbers.
    username: `e2e${stamp.slice(-9)}`,
    password: randomBytes(18).toString("base64url"),
  };
}

export async function signUp(
  page: Page,
  account: { name: string; email: string; password: string },
) {
  await page.goto("/sign-up");
  await page.getByLabel("Full name").fill(account.name);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Opens a page and says where the browser ended up (the app redirects accounts to where they belong). */
export async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return new URL(page.url()).pathname;
}

export async function expectNotFound(page: Page) {
  await expect(page.getByText("This page could not be found")).toBeVisible();
}
