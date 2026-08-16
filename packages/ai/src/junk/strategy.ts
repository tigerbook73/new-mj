import type { JunkAction, JunkPlayerView } from "@new-mj/core";
import type { JunkAnalysisCache } from "./analysis.ts";
import { scoreLegalActions, type ScoredAction } from "./action-scoring.ts";
import { recommendStructuralClaim } from "./structural-claim.ts";
import { recommendStructuralTurn } from "./structural-turn.ts";
import { DEFAULT_JUNK_WEIGHTS, type JunkWeights } from "./weights.ts";

export { createJunkAnalysisCache, type JunkAnalysisCache } from "./analysis.ts";
export {
  scoreDiscardActionsTwoPlyAll,
  scoreLegalActions,
  scoreLegalActionsOnePlyAll,
  type ScoredAction,
} from "./action-scoring.ts";
export { scoreHandShapeAfterDiscard, type GameProgress } from "./hand-quality.ts";
export {
  evaluateStructuralDiscard,
  recommendStructuralDiscard,
  type StructuralDiscardCandidate,
  type StructuralDiscardOptions,
  type StructuralDiscardResult,
  type StructuralShape,
} from "./structural-discard.ts";
export {
  evaluateStructuralClaim,
  recommendStructuralClaim,
  type StructuralClaimCandidate,
  type StructuralClaimResult,
} from "./structural-claim.ts";
export {
  evaluateStructuralTurn,
  recommendStructuralTurn,
  type StructuralTurnCandidate,
  type StructuralTurnResult,
} from "./structural-turn.ts";
export {
  evaluateStructuralRoutes,
  type StructuralRoute,
  type StructuralRouteResult,
} from "./structural-routes.ts";
export {
  probeSelfDrawTwoPly,
  type SelfDrawTwoPlyOutcome,
  type SelfDrawTwoPlyProbe,
} from "./two-ply.ts";
export { DEFAULT_JUNK_WEIGHTS, JUNK_FAN_WEIGHTS, type JunkWeights } from "./weights.ts";

/**
 * Softmax temperature knob for action sampling. Omitted or <= 0 reproduces the
 * previous deterministic argmax bit-for-bit. `random` defaults to Math.random for
 * zero-config production use (bot autoplay / advice); inject a seeded generator
 * for reproducible self-play/arena runs.
 */
export type JunkStrengthConfig = {
  temperature?: number;
  random?: () => number;
  analysisCache?: JunkAnalysisCache;
};

const isClaimContext = (legalActions: readonly JunkAction[]): boolean =>
  legalActions.some((action) => ["chi", "peng", "minGang", "hu", "pass"].includes(action.type));

/**
 * Complete ordinary-standard structural policy facade. This remains an explicit
 * shadow entry point until its legality, runtime and A/B gates have passed; the
 * production recommendJunkAction path below is intentionally unchanged.
 */
export const recommendStructuralJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): JunkAction | undefined => {
  if (legalActions.length === 0) return undefined;
  const winning = legalActions.find((action) => action.type === "hu" || action.type === "zimo");
  if (winning) return winning;
  const draw = legalActions.find((action) => action.type === "draw");
  if (draw) return draw;

  const recommended = isClaimContext(legalActions)
    ? recommendStructuralClaim(view, legalActions)
    : recommendStructuralTurn(view, legalActions);
  return recommended && legalActions.includes(recommended) ? recommended : legalActions[0];
};

const argmaxAction = (scored: readonly ScoredAction[]): JunkAction | undefined => {
  let best: JunkAction | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const { action, score } of scored) {
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best;
};

/** Numerically stable softmax sampling over precomputed action scores. */
const sampleSoftmax = (
  scored: readonly ScoredAction[],
  temperature: number,
  random: () => number,
): JunkAction | undefined => {
  if (scored.length === 0) return undefined;
  const maxScore = Math.max(...scored.map(({ score }) => score));
  const weights = scored.map(({ score }) => Math.exp((score - maxScore) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const threshold = random() * total;
  let cumulative = 0;
  for (const [index, weight] of weights.entries()) {
    cumulative += weight;
    if (threshold < cumulative) return scored[index]!.action;
  }
  return scored[scored.length - 1]!.action;
};

export const recommendJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
  strength: JunkStrengthConfig = {},
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
): JunkAction | undefined => {
  const winning = legalActions.find((action) => action.type === "hu" || action.type === "zimo");
  if (winning) return winning;
  const scored = scoreLegalActions(view, legalActions, weights, strength.analysisCache);
  const temperature = strength.temperature ?? 0;
  if (temperature <= 0) return argmaxAction(scored);
  return sampleSoftmax(scored, temperature, strength.random ?? Math.random);
};

export const chooseJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
  strength: JunkStrengthConfig = {},
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
): JunkAction => {
  const action = recommendJunkAction(view, legalActions, strength, weights);
  if (!action) throw new Error("chooseJunkAction called with no legal actions");
  return action;
};
