import defaultWeightsData from "./default-weights.json" with { type: "json" };

/** Every configurable coefficient used by the production Junk policy. */
export type JunkWeights = {
  qidui: number;
  pengpenghu: number;
  menqing: number;
  qingyise: number;
  hunyise: number;
  gangkai: number;
  buGangPenalty: number;
  pairBonus: number;
  meldBonus: number;
  qiduiPotential: number;
  shantenWeight: number;
  tenpaiProbabilityWeight: number;
  safetyBonus: number;
  isolationPotential: number;
  chiHurdle: number;
  pengHurdle: number;
};

/** Immutable production defaults; offline tuning must replace the JSON explicitly. */
export const DEFAULT_JUNK_WEIGHTS: JunkWeights = Object.freeze({ ...defaultWeightsData });

/** Stable compatibility view over the fan-related production defaults. */
export const JUNK_FAN_WEIGHTS = {
  qidui: DEFAULT_JUNK_WEIGHTS.qidui,
  pengpenghu: DEFAULT_JUNK_WEIGHTS.pengpenghu,
  menqing: DEFAULT_JUNK_WEIGHTS.menqing,
  qingyise: DEFAULT_JUNK_WEIGHTS.qingyise,
  hunyise: DEFAULT_JUNK_WEIGHTS.hunyise,
  gangkai: DEFAULT_JUNK_WEIGHTS.gangkai,
} as const;
