"use client";

import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Browser-side Better Auth client: sign-in, sign-up and Google. Everything else goes through server actions.
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});
