export const CORE_ERROR_CODES = {
  invalidConfig: "INVALID_CONFIG",
  invalidTileId: "INVALID_TILE_ID",
  duplicateTile: "DUPLICATE_TILE",
  invalidEventSequence: "INVALID_EVENT_SEQUENCE",
  unknownRuleset: "UNKNOWN_RULESET",
} as const;

export type CoreErrorCode = (typeof CORE_ERROR_CODES)[keyof typeof CORE_ERROR_CODES];
