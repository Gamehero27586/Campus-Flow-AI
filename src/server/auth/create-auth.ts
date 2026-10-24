import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@/config/limits";
import { isUsernameAllowed } from "@/lib/usernames";
import * as schema from "@/server/db/schema";
import { REQUESTED_ROLES, USER_STATUSES } from "@/server/db/schema/enums";

type AuthDatabase = Parameters<typeof drizzleAdapter>[0];

export type AuthSettings = {
  secret: string;
  baseURL: string;
  google?: { clientId: string; clientSecret: string };
};

// Fields only our own server code may write (docs/permissions.md §6 rule 10).
// Better Auth must never accept them from a request.
export const APP_OWNED_USER_FIELDS = [
  "status",
  "requestedRole",
  "roleId",
  "timezone",
  "approvedBy",
  "approvedAt",
  "rejectionReason",
  "isSeed",
] as const;

/** A display username may differ from the username only in letter case. */
function assertDisplayUsernameMatches(displayUsername: unknown, username: unknown) {
  if (displayUsername === undefined || displayUsername === null) return;
  const matches =
    typeof displayUsername === "string" &&
    typeof username === "string" &&
    displayUsername.toLowerCase() === username.toLowerCase();
  if (!matches) {
    throw new APIError("BAD_REQUEST", { message: "Display username must match the username" });
  }
}

/** Was this request part of a Google (OAuth) sign-in rather than a form the user filled in? */
function isSocialPath(path: unknown): boolean {
  return typeof path === "string" && (path.startsWith("/callback/") || path === "/sign-in/social");
}

/**
 * Better Auth lets any caller of sign-up and update-user send any `name`, so the limit is enforced
 * here as well as in the form. Google names are shortened instead of refused, so a long Google
 * profile name cannot lock someone out of signing in.
 */
function checkedName(name: unknown, viaSocial: boolean, email: unknown): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length === 0) {
    if (viaSocial && typeof email === "string")
      return email.split("@")[0].slice(0, NAME_MAX_LENGTH);
    throw new APIError("BAD_REQUEST", { message: "Name is required" });
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    if (viaSocial) return trimmed.slice(0, NAME_MAX_LENGTH);
    throw new APIError("BAD_REQUEST", { message: "Name is too long" });
  }
  return trimmed;
}

export function createAuth(database: AuthDatabase, settings: AuthSettings) {
  return betterAuth({
    secret: settings.secret,
    baseURL: settings.baseURL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    advanced: {
      // Our tables use uuid ids.
      database: { generateId: "uuid" },
    },
    emailAndPassword: {
      enabled: true,
      // No email is sent in the MVP, so email ownership is not proven (docs/decisions.md §3).
      requireEmailVerification: false,
      // Sign-up creates the account only. The person then signs in with the new email and password
      // (the sign-up page sends them to the sign-in page), and the welcome step follows.
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    socialProviders: settings.google
      ? {
          google: {
            clientId: settings.google.clientId,
            clientSecret: settings.google.clientSecret,
            // Always show Google's account picker. Without it, Google silently uses whichever
            // account the browser is already signed in to, which is risky on a shared computer.
            prompt: "select_account",
          },
        }
      : {},
    user: {
      additionalFields: {
        // input: false on every one: Better Auth's endpoints (sign-up, update-user) refuse them.
        // Our own server code writes them with Drizzle.
        status: {
          type: [...USER_STATUSES],
          required: false,
          defaultValue: "pending",
          input: false,
        },
        requestedRole: {
          type: [...REQUESTED_ROLES],
          required: false,
          input: false,
          returned: false,
        },
        roleId: { type: "string", required: false, input: false, returned: false },
        timezone: { type: "string", required: false, defaultValue: "Asia/Kolkata", input: false },
        approvedBy: { type: "string", required: false, input: false, returned: false },
        approvedAt: { type: "date", required: false, input: false, returned: false },
        rejectionReason: { type: "string", required: false, input: false, returned: false },
        isSeed: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
          returned: false,
        },
      },
    },
    account: {
      // A Google login never merges silently into an existing email and password account.
      accountLinking: { disableImplicitLinking: true },
    },
    session: {
      // Off on purpose: permissions and status are read from the database on every request.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      // Better Auth rate limits only run in production mode, so demos use a production build.
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    // is-username-available would let anyone test which usernames exist.
    // The password-reset and email-verification endpoints are off: no email in the MVP, and
    // Admin reset links come in Slice 10.
    // /sign-in/username is also off: people sign in with email and password only.
    // /unlink-account and /list-accounts are off too: the Settings page reads our own tables.
    // /link-social stays ON: a signed-in user connects Google from Settings. That is explicit
    // linking (the person has just proved they own the account with their password), unlike the
    // implicit linking that is disabled above.
    disabledPaths: [
      "/unlink-account",
      "/list-accounts",
      "/is-username-available",
      "/sign-in/username",
      "/request-password-reset",
      "/forget-password",
      "/send-verification-email",
      "/verify-email",
    ],
    databaseHooks: {
      user: {
        create: {
          // Belt and braces next to input: false. Whatever reaches Better Auth, a new account
          // is pending, has no role, and is not seed data.
          before: async (user, context) => {
            assertDisplayUsernameMatches(user.displayUsername, user.username);
            const viaSocial = isSocialPath(context?.path);
            return {
              data: {
                ...user,
                name: checkedName(user.name, viaSocial, user.email),
                // An avatar is kept only from Google. A user-supplied URL would be a tracking pixel
                // for everyone who sees it, and there is no avatar feature (review R2).
                image: viaSocial ? (user.image ?? null) : null,
                status: "pending",
                requestedRole: null,
                roleId: null,
                approvedBy: null,
                approvedAt: null,
                rejectionReason: null,
                isSeed: false,
              },
            };
          },
        },
        update: {
          // Our own code updates the app-owned fields with Drizzle directly, so any update that
          // reaches Better Auth and touches them is an attack or a bug.
          before: async (data, context) => {
            const touched = APP_OWNED_USER_FIELDS.filter((field) => field in data);
            if (touched.length > 0) {
              throw new APIError("BAD_REQUEST", { message: "Field not allowed" });
            }
            const viaSocial = isSocialPath(context?.path);
            // Users cannot set an avatar (there is no avatar feature), and name has a length limit.
            // The update-user handler passes name and image as keys even when the caller did not
            // send them (value undefined), so test for a value, not for the key.
            if (data.image !== undefined && !viaSocial) {
              throw new APIError("BAD_REQUEST", { message: "Field not allowed" });
            }
            if (data.name !== undefined) {
              data = { ...data, name: checkedName(data.name, viaSocial, undefined) };
            }
            // The username is immutable, but Better Auth lets displayUsername change freely.
            // It may differ from the username only in letter case, so nobody can display "Admin".
            if ("displayUsername" in data) {
              const currentUsername = context?.context?.session?.user?.username;
              assertDisplayUsernameMatches(
                data.displayUsername,
                typeof data.username === "string" ? data.username : currentUsername,
              );
            }
            return { data };
          },
        },
      },
    },
    plugins: [
      username({
        minUsernameLength: USERNAME_MIN_LENGTH,
        maxUsernameLength: USERNAME_MAX_LENGTH,
        immutableUsername: true,
        // Replaces the plugin's default character check, so it repeats it and adds the reserved names.
        usernameValidator: isUsernameAllowed,
      }),
      // Must be last: lets server actions set cookies.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
