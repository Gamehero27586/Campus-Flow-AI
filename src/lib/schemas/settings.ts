import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";

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
