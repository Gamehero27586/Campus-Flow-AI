import "server-only";
import { isPrivateLanOrigin } from "@/lib/local-address";

/**
 * Development only (DEV_ALLOW_LAN=yes): Better Auth's list of extra trusted origins for one request. The
 * request's own Origin is trusted only when it is a private network address such as http://192.168.1.9:3000,
 * so a phone on the home Wi-Fi can sign in. A domain name, a tunnel or a public address is never trusted.
 * No wildcard pattern is used on purpose: Better Auth's `*` also matches dots, so "192.168.*" would match
 * "192.168.1.evil.com".
 */
export function lanTrustedOrigins(request?: Request): string[] {
  const origin = request?.headers.get("origin");
  return origin && isPrivateLanOrigin(origin) ? [origin] : [];
}
