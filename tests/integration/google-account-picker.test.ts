import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Auth, createAuth } from "@/server/auth/create-auth";
import { createTestDb } from "../helpers/test-db";

// Google must always show its account picker, so it never silently uses whichever Google account
// the browser happens to be signed in to. The URL is built locally; no request goes to Google.

let auth: Auth;
let close: () => Promise<void>;

beforeAll(async () => {
  const test = await createTestDb();
  close = () => test.client.close();
  auth = createAuth(test.db, {
    secret: "test-secret-test-secret-test-secret-0000",
    baseURL: "http://localhost:3000",
    google: { clientId: "fake-client-id", clientSecret: "fake-client-secret" },
  });
});

afterAll(async () => {
  await close();
});

describe("Google account picker", () => {
  it("is requested on the Google sign-in URL", async () => {
    const result = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: "/" },
    });
    expect(result.url).toBeDefined();
    const url = new URL(result.url!);
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("client_id")).toBe("fake-client-id");
  });

  it("is configured on the provider, which the Connect Google link flow uses too", () => {
    expect(auth.options.socialProviders?.google?.prompt).toBe("select_account");
  });
});
