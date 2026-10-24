"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { linkGoogleErrorMessage } from "@/lib/auth-messages";

// Explicit linking: the person is already signed in (so they have proved they own this account),
// and Google must return the same email address. Better Auth checks both.
export function ConnectGoogleButton() {
  const [pending, setPending] = useState(false);

  async function connect() {
    setPending(true);
    const { error } = await authClient.linkSocial({
      provider: "google",
      callbackURL: "/settings?linked=google",
      errorCallbackURL: "/settings",
    });
    // On success the browser is already on its way to Google, so only a failure gets here.
    if (error) {
      toast.error(linkGoogleErrorMessage(error.code ?? null));
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={connect}>
      {pending ? "Opening Google..." : "Connect Google"}
    </Button>
  );
}

/** Shows the result of the Google round trip once, when Settings reloads with ?linked or ?error. */
export function LinkResultToast({ linked, error }: { linked: boolean; error: string | null }) {
  useEffect(() => {
    // Fixed ids stop a duplicate toast when React runs effects twice in development.
    if (linked) toast.success("Google connected. You can now sign in with Google.", { id: "link" });
    else if (error) toast.error(linkGoogleErrorMessage(error), { id: "link" });
  }, [linked, error]);

  return null;
}
