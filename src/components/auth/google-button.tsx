"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function GoogleButton() {
  const [pending, setPending] = useState(false);

  async function signInWithGoogle() {
    setPending(true);
    // Better Auth sends the browser to Google and back to /. A failure returns to /sign-in?error=...
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/sign-in",
    });
    setPending(false);
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={signInWithGoogle}
    >
      Continue with Google
    </Button>
  );
}
