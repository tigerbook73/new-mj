import { CORE_ERROR_CODES } from "../../errors.ts";
import type { HangzhouConfig } from "./types.ts";
import { HANGZHOU_MULTI_HU_POLICIES } from "./constants.ts";

// docs/variants/hangzhou.md §7/§12: baseScore=1, multiHuPolicy defaults to
// headJump (confirmed); payout formula itself is fixed (not configurable).
// dealerStreak defaults to 1 (a fresh dealer's first term) — the room layer
// overwrites it per game, see hangzhou.md §8.
export const DEFAULT_HANGZHOU_CONFIG: HangzhouConfig = {
  rulesetId: "hangzhou",
  multiHuPolicy: "headJump",
  baseScore: 1,
  dealerStreak: 1,
};

export const parseHangzhouConfig = (
  input: unknown,
): { config: HangzhouConfig } | { error: { code: string } } => {
  if (input === undefined) return { config: { ...DEFAULT_HANGZHOU_CONFIG } };
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: { code: CORE_ERROR_CODES.invalidConfig } };
  const candidate = input as Record<string, unknown>;
  if (
    (candidate.rulesetId !== undefined && candidate.rulesetId !== "hangzhou") ||
    (candidate.multiHuPolicy !== undefined &&
      !HANGZHOU_MULTI_HU_POLICIES.includes(
        candidate.multiHuPolicy as HangzhouConfig["multiHuPolicy"],
      )) ||
    (candidate.baseScore !== undefined &&
      (typeof candidate.baseScore !== "number" ||
        !Number.isInteger(candidate.baseScore) ||
        candidate.baseScore < 1)) ||
    (candidate.dealerStreak !== undefined &&
      (typeof candidate.dealerStreak !== "number" ||
        !Number.isInteger(candidate.dealerStreak) ||
        candidate.dealerStreak < 1))
  ) {
    return { error: { code: CORE_ERROR_CODES.invalidConfig } };
  }
  return {
    config: {
      ...DEFAULT_HANGZHOU_CONFIG,
      ...(candidate.multiHuPolicy === undefined
        ? {}
        : { multiHuPolicy: candidate.multiHuPolicy as HangzhouConfig["multiHuPolicy"] }),
      ...(candidate.baseScore === undefined ? {} : { baseScore: candidate.baseScore as number }),
      ...(candidate.dealerStreak === undefined
        ? {}
        : { dealerStreak: candidate.dealerStreak as number }),
    },
  };
};
