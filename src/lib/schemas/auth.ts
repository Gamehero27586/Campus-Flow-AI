import { z } from "zod";
import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@/config/limits";
import { isReservedUsername } from "@/lib/usernames";

// Form schemas shared by the browser forms and the server (docs/folder-structure.md §4).
// They live in src/lib because the forms run in the browser; src/server files cannot be imported there.

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(NAME_MAX_LENGTH, `Use at most ${NAME_MAX_LENGTH} characters.`),
  email: emailSchema,
  password: passwordSchema,
});

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, `Use at least ${USERNAME_MIN_LENGTH} characters.`)
  .max(USERNAME_MAX_LENGTH, `Use at most ${USERNAME_MAX_LENGTH} characters.`)
  .regex(/^[A-Za-z0-9._]+$/, "Use only letters, numbers, dots and underscores.")
  .refine((value) => !isReservedUsername(value), "That username can't be used.");

export const REQUESTABLE_ROLES = ["student", "faculty"] as const;

export const welcomeSchema = z.object({
  username: usernameSchema,
  // A hint for the Admin only. Empty means "no preference".
  requestedRole: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(REQUESTABLE_ROLES).optional(),
  ),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type WelcomeInput = z.infer<typeof welcomeSchema>;
