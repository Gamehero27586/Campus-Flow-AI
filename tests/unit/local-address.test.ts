import { describe, expect, it } from "vitest";
import { isLocalAddress } from "@/lib/local-address";

describe("isLocalAddress()", () => {
  it.each([
    "http://localhost:3000",
    "https://localhost",
    "http://LOCALHOST:3100/path",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])("accepts %s", (url) => {
    expect(isLocalAddress(url)).toBe(true);
  });

  it.each([
    "https://example.com",
    "http://localhost.example.com",
    "http://notlocalhost:3000",
    "http://127.0.0.1.example.com",
    "http://0.0.0.0:3000",
    "http://192.168.0.5:3000",
    "https://abc.trycloudflare.com",
    "not a url",
    "",
  ])("refuses %j", (url) => {
    expect(isLocalAddress(url)).toBe(false);
  });
});
