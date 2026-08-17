import type { JunkAction, JunkPlayerView } from "@new-mj/core";
import { recommendStructuralClaim } from "./structural-claim.ts";
import { recommendStructuralTurn } from "./structural-turn.ts";

/** Stable identity of the current production policy; bump the version for intentional behavior changes. */
export const JUNK_STRUCTURAL_BASELINE = Object.freeze({
  id: "structural-baseline",
  version: 1,
  scope: "ordinary-standard",
} as const);

const isClaimContext = (legalActions: readonly JunkAction[]): boolean =>
  legalActions.some((action) => ["chi", "peng", "minGang", "hu", "pass"].includes(action.type));

/** Frozen v1 ordinary-standard policy used by production and baseline tests. */
export const recommendStructuralBaselineV1Action = (
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
