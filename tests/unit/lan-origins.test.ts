import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateLanOrigin } from "@/lib/local-address";
import { lanTrustedOrigins } from "@/server/auth/lan-origins";

// Trying the app on a phone over the home Wi-Fi (DEV_ALLOW_LAN=yes, development only): only a private
// network address is ever trusted, and nothing that merely looks like one.

describe("isPrivateLanOrigin()", () => {
  it.each([
    "http://192.168.1.9:3000",
    "http://192.168.0.101:3000",
    "http://10.0.0.5:3000",
    "http://10.255.255.255",
    "http://172.16.0.1:3000",
    "http://172.31.255.254:3000",
    "http://192.168.1.9:3000/",
  ])("accepts %s", (value) => {
    expect(isPrivateLanOrigin(value)).toBe(true);
  });

  it.each([
    // Look-alikes: a domain that starts like an address, and addresses outside the private ranges.
    "http://192.168.1.9.evil.com:3000",
    "http://192.168.1.evil.com",
    "http://evil.com/192.168.1.9",
    "http://172.15.0.1:3000",
    "http://172.32.0.1:3000",
    "http://11.0.0.1:3000",
    "http://8.8.8.8",
    "http://192.169.1.9",
    // Not plain http origins.
    "https://192.168.1.9:3000",
    "http://192.168.1.9:3000/dashboard",
    "http://192.168.1.9:3000?x=1",
    "http://user:pass@192.168.1.9:3000",
    "http://localhost:3000",
    "http://[::1]:3000",
    // Not valid addresses.
    "http://192.168.1:3000",
    "http://192.168.1.999:3000",
    "http://192.168.01.9:3000",
    "https://abc.trycloudflare.com",
    "not a url",
    "",
  ])("refuses %j", (value) => {
    expect(isPrivateLanOrigin(value)).toBe(false);
  });
});

describe("lanTrustedOrigins()", () => {
  const requestFrom = (origin: string | null) =>
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: origin ? { origin } : {},
    });

  it("trusts the Origin of a request from a private network address", () => {
    expect(lanTrustedOrigins(requestFrom("http://192.168.1.9:3000"))).toEqual(["http://192.168.1.9:3000"]);
  });

  it("trusts nothing for a domain, a public address, a missing Origin or no request", () => {
    expect(lanTrustedOrigins(requestFrom("https://evil.example.com"))).toEqual([]);
    expect(lanTrustedOrigins(requestFrom("http://192.168.1.9.evil.com"))).toEqual([]);
    expect(lanTrustedOrigins(requestFrom("http://8.8.8.8"))).toEqual([]);
    expect(lanTrustedOrigins(requestFrom(null))).toEqual([]);
    expect(lanTrustedOrigins(undefined)).toEqual([]);
  });
});

describe("src/env.ts DEV_ALLOW_LAN", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadWith(nodeEnv: string, value: string) {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("DEV_ALLOW_LAN", value);
    vi.resetModules();
    return import("@/env");
  }

  it("is off unless set to yes, and accepts yes in development", async () => {
    const { env } = await loadWith("development", "yes");
    expect(env.DEV_ALLOW_LAN).toBe("yes");
    const unset = await loadWith("development", "");
    expect(unset.env.DEV_ALLOW_LAN).toBeUndefined();
  });

  it("refuses any other value", async () => {
    await expect(loadWith("development", "true")).rejects.toThrow(/DEV_ALLOW_LAN/);
  });

  it("is ignored, not refused, in production and in tests, so a build still works with the line in .env.local", async () => {
    expect((await loadWith("production", "yes")).env.DEV_ALLOW_LAN).toBeUndefined();
    expect((await loadWith("test", "yes")).env.DEV_ALLOW_LAN).toBeUndefined();
  });
});
