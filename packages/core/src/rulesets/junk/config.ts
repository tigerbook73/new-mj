import type { JunkConfig } from "./types.ts";

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
      candidate.multiHuPolicy !== "headJump" &&
      candidate.multiHuPolicy !== "all")
  ) {
    return { error: { code: "INVALID_CONFIG" } };
  }
  return {
    config: {
      ...DEFAULT_JUNK_CONFIG,
      ...(candidate.sevenPairs === undefined ? {} : { sevenPairs: candidate.sevenPairs }),
      ...(candidate.robKong === undefined ? {} : { robKong: candidate.robKong }),
      ...(candidate.multiHuPolicy === undefined ? {} : { multiHuPolicy: candidate.multiHuPolicy }),
    },
  };
};
