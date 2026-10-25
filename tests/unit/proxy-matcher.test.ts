import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// Which request paths does the proxy run on? It redirects visitors with no session cookie to
// /sign-in, so it must NOT run on assets the sign-in page itself needs (a signed-out visitor's
// logo request would be redirected, and the image would be broken).

const matcher = new RegExp(`^${config.matcher[0]}$`);

describe("proxy matcher", () => {
  it.each(["/", "/dashboard", "/settings", "/admin/users", "/sign-in", "/welcome", "/pending"])(
    "runs on the page %s",
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );

  it.each([
    "/brand/mark-light.svg",
    "/brand/mark-dark.svg",
    "/brand/some-future-logo.png",
    "/icon.svg",
    "/favicon.ico",
    "/some-new-folder/picture.jpg",
    "/images/diagram.svg",
    "/fonts/custom.woff2",
    "/_next/static/chunks/app.js",
    "/_next/image",
  ])("does not run on the static file %s", (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  it.each([
    "/api/auth/sign-in/email",
    "/api/auth/callback/google",
    "/api/uploads",
    "/api/files/abc",
  ])("does not run on the route %s (they check the session themselves)", (path) => {
    expect(matcher.test(path)).toBe(false);
  });
});
