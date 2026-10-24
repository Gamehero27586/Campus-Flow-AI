import { describe, expect, it } from "vitest";
import {
  googleErrorMessage,
  linkGoogleErrorMessage,
  signInErrorMessage,
  signUpErrorMessage,
} from "@/lib/auth-messages";

describe("linkGoogleErrorMessage()", () => {
  it("explains an email that does not match", () => {
    expect(linkGoogleErrorMessage("email_doesn't_match")).toMatch(/same email address/i);
  });

  it("explains a Google account that is already connected elsewhere", () => {
    expect(linkGoogleErrorMessage("account_already_linked_to_different_user")).toMatch(
      /already connected to another user/i,
    );
  });

  it("uses a general message for anything else, including no code", () => {
    expect(linkGoogleErrorMessage("unable_to_link_account")).toMatch(/could not connect google/i);
    expect(linkGoogleErrorMessage(null)).toMatch(/could not connect google/i);
  });
});

describe("signInErrorMessage()", () => {
  it("gives the same message for a wrong password and an unknown email", () => {
    expect(signInErrorMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "The email or password is not correct.",
    );
    expect(signInErrorMessage({ status: 400, code: "USER_NOT_FOUND" })).toBe(
      "The email or password is not correct.",
    );
  });

  it("says when there were too many attempts", () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/too many attempts/i);
  });

  it("says when the server could not be reached", () => {
    expect(signInErrorMessage({ status: 0 })).toMatch(/could not reach the server/i);
    expect(signInErrorMessage(undefined)).toMatch(/could not reach the server/i);
  });

  it("says when the problem is on our side", () => {
    expect(signInErrorMessage({ status: 500 })).toMatch(/our side/i);
  });
});

describe("signUpErrorMessage()", () => {
  it("names the existing-account case", () => {
    expect(signUpErrorMessage({ status: 422, code: "USER_ALREADY_EXISTS" })).toMatch(
      /already exists/i,
    );
  });

  it("names password length problems", () => {
    expect(signUpErrorMessage({ status: 400, code: "PASSWORD_TOO_SHORT" })).toMatch(/too short/i);
    expect(signUpErrorMessage({ status: 400, code: "PASSWORD_TOO_LONG" })).toMatch(/too long/i);
  });

  it("covers rate limits, no answer and server errors", () => {
    expect(signUpErrorMessage({ status: 429 })).toMatch(/too many attempts/i);
    expect(signUpErrorMessage({ status: 0 })).toMatch(/could not reach the server/i);
    expect(signUpErrorMessage({ status: 503 })).toMatch(/our side/i);
  });

  it("falls back to a general message for anything else", () => {
    expect(signUpErrorMessage({ status: 400, code: "SOMETHING_NEW" })).toMatch(
      /could not create that account/i,
    );
  });
});

describe("googleErrorMessage()", () => {
  it("returns nothing when there is no error", () => {
    expect(googleErrorMessage(null)).toBeNull();
  });

  it("explains an account that was not linked, and tells the person what to do", () => {
    const message = googleErrorMessage("account_not_linked");
    expect(message).toMatch(/email and password/i);
    expect(message).toMatch(/Connect Google in Settings/);
  });

  it("uses a general message for other Google errors", () => {
    expect(googleErrorMessage("access_denied")).toMatch(/did not work/i);
  });
});
