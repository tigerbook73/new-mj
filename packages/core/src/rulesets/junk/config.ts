import type { JunkConfig } from "./types.ts";
import { JUNK_MULTI_HU_POLICIES } from "./constants.ts";

export const DEFAULT_JUNK_CONFIG: JunkConfig = {
  rulesetId: "junk",
  sevenPairs: false,
  robKong: false,
  multiHuPolicy: "headJump",
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
    (candidate.sevenPairs !== undefined && typeof candidate.sevenPairs !== "boolean") ||
    (candidate.robKong !== undefined && typeof candidate.robKong !== "boolean") ||
    (candidate.multiHuPolicy !== undefined &&
      !JUNK_MULTI_HU_POLICIES.includes(candidate.multiHuPolicy as JunkConfig["multiHuPolicy"]))
  ) {
    return { error: { code: "INVALID_CONFIG" } };
  }
  const multiHuPolicy =
    candidate.multiHuPolicy === undefined
      ? DEFAULT_JUNK_CONFIG.multiHuPolicy
      : (candidate.multiHuPolicy as JunkConfig["multiHuPolicy"]);
  return {
    config: {
      ...DEFAULT_JUNK_CONFIG,
      ...(candidate.sevenPairs === undefined ? {} : { sevenPairs: candidate.sevenPairs }),
      ...(candidate.robKong === undefined ? {} : { robKong: candidate.robKong }),
      multiHuPolicy,
    },
  };
};
