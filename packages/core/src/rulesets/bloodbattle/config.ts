import type { BloodbattleConfig } from "./types.ts";

export const DEFAULT_BLOODBATTLE_CONFIG: BloodbattleConfig = {
  rulesetId: "bloodbattle",
  exchangeThree: true,
  capFan: 4,
  multiWinOnDiscard: true,
  robKong: true,
  checkHuaZhu: true,
  checkDaJiao: true,
  gangRefund: true,
  selfDrawBonus: "addFan",
  mustHuOnLastFour: false,
};

export const parseBloodbattleConfig = (
  input: unknown = {},
): { config: BloodbattleConfig } | { error: { code: string } } => {
  if (typeof input !== "object" || input === null) return { error: { code: "INVALID_CONFIG" } };
  const value = input as Record<string, unknown>;
  const config = { ...DEFAULT_BLOODBATTLE_CONFIG, ...value, rulesetId: "bloodbattle" as const };
  if (typeof config.exchangeThree !== "boolean" || typeof config.multiWinOnDiscard !== "boolean")
    return { error: { code: "INVALID_CONFIG" } };
  if (config.capFan !== null && (!Number.isInteger(config.capFan) || config.capFan < 0))
    return { error: { code: "INVALID_CONFIG" } };
  if (config.checkHuaZhu && config.capFan === null)
    return { error: { code: "HUAZHU_REQUIRES_CAP_FAN" } };
  if (
    typeof config.robKong !== "boolean" ||
    typeof config.checkHuaZhu !== "boolean" ||
    typeof config.checkDaJiao !== "boolean" ||
    typeof config.gangRefund !== "boolean" ||
    (config.selfDrawBonus !== "addFan" && config.selfDrawBonus !== "addBase") ||
    typeof config.mustHuOnLastFour !== "boolean"
  )
    return { error: { code: "INVALID_CONFIG" } };
  return { config };
};
