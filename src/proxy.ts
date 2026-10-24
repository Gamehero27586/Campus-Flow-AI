import { NextResponse } from "next/server";

// Coarse redirects only (signed out, no username, pending) are added in Slice 1.
// This file is never the access check: every page, action and route handler checks on the server.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  // Excluded: Better Auth, the upload and download routes (Next.js truncates bodies over 10 MB here), and static files.
  matcher: ["/((?!api/auth|api/uploads|api/files|_next/static|_next/image|favicon.ico).*)"],
};
