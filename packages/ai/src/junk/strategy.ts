import type { JunkAction, JunkPlayerView } from "@new-mj/core";
import { recommendStructuralBaselineV5Action } from "./structural-baseline.ts";
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
  classifyOrdinaryStructuralGate,
  evaluateStructuralRoutes,
  type OrdinaryStructuralGate,
  type OrdinaryStructuralGateRoute,
  type StructuralRoute,
  type StructuralRouteResult,
} from "./structural-routes.ts";
export {
  JUNK_STRUCTURAL_BASELINE,
  recommendStructuralBaselineV5Action,
  recommendStructuralBaselineV5ActionWithDiagnostics,
  type StructuralDecisionDiagnostics,
} from "./structural-baseline.ts";
export { JunkBotAgent, type JunkBotAgentSnapshot } from "./bot-agent.ts";

/** Complete ordinary-standard + seven-pairs structural policy facade and production baseline. */
export const recommendStructuralJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): JunkAction | undefined => recommendStructuralBaselineV5Action(view, legalActions);

export const recommendJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): JunkAction | undefined => recommendStructuralJunkAction(view, legalActions);

export const chooseJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): JunkAction => {
  const action = recommendJunkAction(view, legalActions);
  if (!action) throw new Error("chooseJunkAction called with no legal actions");
  return action;
};
