import { z } from "zod";

/** True when the runtime knows this IANA time zone name (aliases such as Asia/Calcutta count). */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Choose a time zone.")
  .refine(isValidTimeZone, "That time zone is not recognised.");

export const timezoneFormSchema = z.object({ timezone: timezoneSchema });

/** Time zones for the settings dropdown, with the user's current value always included. */
export function listTimeZones(current: string): string[] {
  const all = new Set(Intl.supportedValuesOf("timeZone"));
  all.add("UTC");
  all.add(current);
  return [...all].sort((a, b) => a.localeCompare(b));
}
