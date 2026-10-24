import { RESERVED_USERNAMES, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@/config/limits";

// One definition of "a username we accept", used by the welcome form and by Better Auth's username plugin.

const ALLOWED_CHARACTERS = /^[A-Za-z0-9._]+$/;
const RESERVED = new Set<string>(RESERVED_USERNAMES);

/** True when the name, ignoring capitals, dots and underscores, is one nobody may take. */
export function isReservedUsername(value: string): boolean {
  return RESERVED.has(value.toLowerCase().replace(/[._]/g, ""));
}

/** Length, characters and reserved names. Length is also enforced by the plugin; it is repeated so one function answers the whole question. */
export function isUsernameAllowed(value: string): boolean {
  return (
    value.length >= USERNAME_MIN_LENGTH &&
    value.length <= USERNAME_MAX_LENGTH &&
    ALLOWED_CHARACTERS.test(value) &&
    !isReservedUsername(value)
  );
}
