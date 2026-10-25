import { ThemeSwitch } from "@/components/theme/theme-switch";
import { env } from "@/env";
import { listTimeZones } from "@/lib/schemas/settings";
import { requirePermission } from "@/server/policies/authorize";
import { hasGoogleLogin, hasPasswordLogin } from "@/server/users/queries";
import { ConnectGoogleButton, LinkResultToast } from "@/app/(app)/settings/connect-google";
import { PasswordForm, TimezoneForm } from "@/app/(app)/settings/settings-forms";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  // Settings need no permission key, only an active account.
  const { user } = await requirePermission(null);
  const [passwordLogin, googleLogin] = await Promise.all([
    hasPasswordLogin(user),
    hasGoogleLogin(user),
  ]);
  const googleAvailable = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  // The Google round trip returns here with ?linked=google or ?error=<code>.
  const { linked, error } = await searchParams;

  return (
    <div className="max-w-2xl space-y-8">
      <LinkResultToast
        linked={linked === "google"}
        error={typeof error === "string" ? error : null}
      />
      <h1 className="text-2xl font-semibold text-brand">Settings</h1>

      <section aria-labelledby="account-heading" className="space-y-2">
        <h2 id="account-heading" className="text-lg font-medium">
          Account
        </h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{user.name}</dd>
          <dt className="text-muted-foreground">Username</dt>
          <dd>{user.displayUsername ?? user.username}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{user.email}</dd>
        </dl>
      </section>

      <section aria-labelledby="appearance-heading" className="space-y-3">
        <h2 id="appearance-heading" className="text-lg font-medium">
          Appearance
        </h2>
        <ThemeSwitch className="max-w-sm" />
        <p className="text-sm text-muted-foreground">
          System follows your computer&apos;s light or dark setting. The choice is saved in this
          browser.
        </p>
      </section>

      <section aria-labelledby="signin-heading" className="space-y-3">
        <h2 id="signin-heading" className="text-lg font-medium">
          Sign-in methods
        </h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Password</dt>
          <dd>{passwordLogin ? "Set" : "Not set"}</dd>
          <dt className="text-muted-foreground">Google</dt>
          <dd>{googleLogin ? "Connected" : "Not connected"}</dd>
        </dl>
        {!googleLogin && googleAvailable ? (
          <div className="space-y-2">
            <ConnectGoogleButton />
            <p className="text-sm text-muted-foreground">
              Choose the Google account that uses {user.email}. After that you can sign in with
              Google or with your password.
            </p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="timezone-heading" className="space-y-3">
        <h2 id="timezone-heading" className="text-lg font-medium">
          Time zone
        </h2>
        <TimezoneForm current={user.timezone} zones={listTimeZones(user.timezone)} />
      </section>

      <section aria-labelledby="password-heading" className="space-y-3">
        <h2 id="password-heading" className="text-lg font-medium">
          Password
        </h2>
        {passwordLogin ? (
          <PasswordForm />
        ) : (
          <p className="text-sm text-muted-foreground">
            This account signs in with Google, so there is no password to change here.
          </p>
        )}
      </section>
    </div>
  );
}
