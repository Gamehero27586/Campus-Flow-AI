import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Convenience only: sends visitors with no session cookie to /sign-in.
// It cannot tell a valid session from a forged cookie, and it does not read the database, so it can
// never decide username or approval status. Every page, action and route handler checks on the
// server (CLAUDE.md security rule 2); the gate in src/server/auth/access-gate.ts does the routing.
const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!isPublic && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Excluded: Better Auth, the upload and download routes (Next.js truncates bodies over 10 MB here), and static files.
  matcher: ["/((?!api/auth|api/uploads|api/files|_next/static|_next/image|favicon.ico).*)"],
};
