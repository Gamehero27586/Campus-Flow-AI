import "server-only";

// Step 2 of the check pipeline (docs/permissions.md §2): which pages may this account reach?
// Pure functions, no database, so the whole table is tested.

export type GateUser = {
  username: string | null;
  status: "pending" | "active" | "rejected" | "deactivated";
};

/** The kinds of page the gate knows about. */
export type Area = "public" | "welcome" | "pending" | "app";

export type GateDecision = { allow: true } | { allow: false; redirectTo: string };

/** Where an account belongs right now. */
export function homeFor(user: GateUser | null): string {
  if (!user) return "/sign-in";
  if (user.status === "rejected" || user.status === "deactivated") return "/pending";
  if (!user.username) return "/welcome";
  if (user.status === "pending") return "/pending";
  return "/dashboard";
}

export function gate(user: GateUser | null, area: Area): GateDecision {
  const allow = { allow: true } as const;
  const send = (redirectTo: string) => ({ allow: false, redirectTo }) as const;

  switch (area) {
    case "public":
      // Sign-in and sign-up pages are for people who are not signed in.
      return user ? send(homeFor(user)) : allow;

    case "welcome":
      // Shown until a username is set. A pending user may still open it (permissions.md §2).
      if (!user) return send("/sign-in");
      if (user.status === "rejected" || user.status === "deactivated") return send("/pending");
      if (user.status === "active" && user.username) return send("/dashboard");
      return allow;

    case "pending":
      // The page that explains the account state and offers sign-out.
      // Rejected and deactivated accounts see only this page (and sign-out).
      if (!user) return send("/sign-in");
      if (user.status === "active") return send(homeFor(user));
      if (user.status === "pending" && !user.username) return send("/welcome");
      return allow;

    case "app":
      // Everything else: active account with a username.
      if (!user) return send("/sign-in");
      return user.status === "active" && user.username ? allow : send(homeFor(user));
  }
}
