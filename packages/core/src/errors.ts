export const CORE_ERROR_CODES = {
  invalidConfig: "INVALID_CONFIG",
  invalidTileId: "INVALID_TILE_ID",
  duplicateTile: "DUPLICATE_TILE",
  invalidEventSequence: "INVALID_EVENT_SEQUENCE",
  unknownRuleset: "UNKNOWN_RULESET",
  // 三个 ruleset 的 applyAction 在动作 type 完全不认识时都返回这个码；
  // 语义通用（不是某个玩法私有的判定），故提到这里统一来源。
  unknownAction: "UNKNOWN_ACTION",
} as const;

export type CoreErrorCode = (typeof CORE_ERROR_CODES)[keyof typeof CORE_ERROR_CODES];
