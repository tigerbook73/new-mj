import type { JunkConfig } from "./types.ts";

export const DEFAULT_JUNK_CONFIG: JunkConfig = {
  rulesetId: "junk",
};

export const parseJunkConfig = (
  input: unknown,
): { config: JunkConfig } | { error: { code: string } } => {
  if (input === undefined) return { config: { ...DEFAULT_JUNK_CONFIG } };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: { code: "INVALID_CONFIG" } };
  const candidate = input as Record<string, unknown>;
  if (
    (candidate.rulesetId !== undefined && candidate.rulesetId !== "junk") ||
    candidate.sevenPairs !== undefined ||
    candidate.robKong !== undefined ||
    candidate.multiHuPolicy !== undefined
  ) {
    return { error: { code: "INVALID_CONFIG" } };
  }
  return { config: { ...DEFAULT_JUNK_CONFIG } };
};
