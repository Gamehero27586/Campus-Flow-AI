import "server-only";
import {
  buildUserPrompt as buildUserPromptV1,
  type BreakdownTaskInput,
  PROMPT_VERSION as V1,
  STRICT_REMINDER as STRICT_REMINDER_V1,
  SYSTEM_PROMPT as SYSTEM_PROMPT_V1,
} from "@/server/ai/prompts/breakdown.v1";
import {
  buildUserPrompt as buildUserPromptV2,
  PROMPT_VERSION as V2,
  STRICT_REMINDER as STRICT_REMINDER_V2,
  SYSTEM_PROMPT as SYSTEM_PROMPT_V2,
} from "@/server/ai/prompts/breakdown.v2";

// Every breakdown prompt version, by name. A new wording is a new file (breakdown.v3.ts) added here; the
// version that built a suggestion is saved with it, and `npm run eval:ai` runs each one. Old versions stay so
// their evaluation results can be repeated and compared.

export type BreakdownPrompt = {
  version: string;
  system: string;
  buildUserPrompt: (task: BreakdownTaskInput, existingStepTitles: string[], today: string) => string;
  strictReminder: string;
};

export const BREAKDOWN_PROMPTS: Record<string, BreakdownPrompt> = {
  [V1]: { version: V1, system: SYSTEM_PROMPT_V1, buildUserPrompt: buildUserPromptV1, strictReminder: STRICT_REMINDER_V1 },
  [V2]: { version: V2, system: SYSTEM_PROMPT_V2, buildUserPrompt: buildUserPromptV2, strictReminder: STRICT_REMINDER_V2 },
};

/**
 * The version new suggestions use: v2, chosen by the owner after scoring the seeded v1 and v2 runs (checkpoint A,
 * 30 Oct 2026). v1 stays registered so its evaluation can be repeated.
 */
export const CURRENT_BREAKDOWN_PROMPT = BREAKDOWN_PROMPTS[V2];
