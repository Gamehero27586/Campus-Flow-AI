// The words shown in toasts when sign-in or sign-up fails.
// `error` is what Better Auth's browser client returns: { status, code, message }.
// A missing or zero status means the request never got an answer (offline, server down).

type AuthClientError = { status?: number; code?: string | null } | null | undefined;

const NO_ANSWER = "We could not reach the server. Check your connection and try again.";
const TOO_MANY = "Too many attempts. Wait a minute and try again.";
const OUR_SIDE = "Something went wrong on our side. Please try again.";

export function signInErrorMessage(error: AuthClientError): string {
  const status = error?.status ?? 0;
  if (status === 0) return NO_ANSWER;
  if (status === 429) return TOO_MANY;
  if (status >= 500) return OUR_SIDE;
  // One message for a wrong password and an unknown email, so it does not reveal which exists.
  return "The email or password is not correct.";
}

export function signUpErrorMessage(error: AuthClientError): string {
  const status = error?.status ?? 0;
  if (status === 0) return NO_ANSWER;
  if (status === 429) return TOO_MANY;
  if (status >= 500) return OUR_SIDE;
  if (
    error?.code === "USER_ALREADY_EXISTS" ||
    error?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
  ) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (error?.code === "PASSWORD_TOO_SHORT") return "That password is too short.";
  if (error?.code === "PASSWORD_TOO_LONG") return "That password is too long.";
  return "We could not create that account. Check the details and try again.";
}

/** Better Auth sends the browser back to /sign-in?error=<code> when a Google sign-in fails. */
export function googleErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "account_not_linked") {
    return "This email already has an account that was made with a password. Sign in with your email and password, then press Connect Google in Settings.";
  }
  return "Google sign-in did not work. Please try again.";
}

/** Errors from the Connect Google button (Settings), either returned directly or in ?error=<code>. */
export function linkGoogleErrorMessage(code: string | null): string {
  const text = (code ?? "").toLowerCase();
  if (text.includes("email")) {
    return "Google must use the same email address as this account. Choose the Google account with that email.";
  }
  if (text.includes("already")) {
    return "That Google account is already connected to another user.";
  }
  return "We could not connect Google. Please try again.";
}
