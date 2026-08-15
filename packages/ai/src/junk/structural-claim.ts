import {
  STANDARD_TILE_SET,
  type JunkAction,
  type JunkPlayerView,
  type TileId,
  type TileKind,
} from "@new-mj/core";
import { evaluateVisibleStructuralShape, type StructuralShape } from "./structural-discard.ts";

type SupportedClaim = Extract<JunkAction, { type: "chi" | "peng" }>;
type ClaimOrPass = Extract<JunkAction, { type: "chi" | "peng" | "minGang" | "pass" | "hu" }>;

export type StructuralClaimCandidate = Readonly<{
  action: ClaimOrPass;
  supported: boolean;
  shape: StructuralShape | null;
  bestDiscard: TileId | null;
}>;

export type StructuralClaimResult = Readonly<{
  action: ClaimOrPass | undefined;
  candidates: readonly StructuralClaimCandidate[];
}>;

const kindOf = (tile: TileId): TileKind => STANDARD_TILE_SET.kindOf(tile);

const removeTiles = (hand: readonly TileId[], removed: readonly TileId[]): TileId[] | undefined => {
  const result = [...hand];
  for (const tile of removed) {
    const index = result.indexOf(tile);
    if (index < 0) return undefined;
    result.splice(index, 1);
  }
  return result;
};

const compareShape = (left: StructuralShape, right: StructuralShape): number =>
  left.standardShanten - right.standardShanten ||
  right.liveImprovingKindCount - left.liveImprovingKindCount ||
  right.liveImprovingTileCount - left.liveImprovingTileCount;

const compareAction = (left: JunkAction, right: JunkAction): number =>
  JSON.stringify(left).localeCompare(JSON.stringify(right));

const uniqueDiscards = (hand: readonly TileId[]): TileId[] => {
  const seen = new Set<TileKind>();
  return hand.filter((tile) => {
    const kind = kindOf(tile);
    if (seen.has(kind)) return false;
    seen.add(kind);
    return true;
  });
};

const handAfterClaim = (
  view: JunkPlayerView,
  action: SupportedClaim,
): readonly TileId[] | undefined => {
  if (action.type === "chi") return removeTiles(view.hand, action.tiles);
  const claimedKind = view.lastDiscard ? kindOf(view.lastDiscard.tile) : undefined;
  if (!claimedKind) return undefined;
  const matching = view.hand.filter((tile) => kindOf(tile) === claimedKind).slice(0, 2);
  return matching.length === 2 ? removeTiles(view.hand, matching) : undefined;
};

const evaluateClaim = (view: JunkPlayerView, action: SupportedClaim): StructuralClaimCandidate => {
  const afterClaim = handAfterClaim(view, action);
  if (!afterClaim || view.lastDiscard === undefined) {
    return { action, supported: false, shape: null, bestDiscard: null };
  }
  const meldCount = view.seats[view.seat]!.melds.length + 1;
  const best = uniqueDiscards(afterClaim)
    .map((discard) => ({
      discard,
      shape: evaluateVisibleStructuralShape(
        view,
        afterClaim.filter((tile) => tile !== discard),
        meldCount,
      ),
    }))
    .sort(
      (left, right) => compareShape(left.shape, right.shape) || left.discard - right.discard,
    )[0];
  return best
    ? { action, supported: true, shape: best.shape, bestDiscard: best.discard }
    : { action, supported: false, shape: null, bestDiscard: null };
};

/**
 * Shadow structural claim policy. Claims must strictly improve over pass;
 * minGang remains unsupported until its replacement-draw branch is modeled.
 */
export const evaluateStructuralClaim = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): StructuralClaimResult => {
  const relevant = legalActions.filter(
    (action): action is ClaimOrPass =>
      action.type === "chi" ||
      action.type === "peng" ||
      action.type === "minGang" ||
      action.type === "pass" ||
      action.type === "hu",
  );
  const winning = relevant.find((action) => action.type === "hu");
  const currentMeldCount = view.seats[view.seat]!.melds.length;
  const candidates = relevant.map((action): StructuralClaimCandidate => {
    if (action.type === "hu") return { action, supported: true, shape: null, bestDiscard: null };
    if (action.type === "pass") {
      return {
        action,
        supported: true,
        shape: evaluateVisibleStructuralShape(view, view.hand, currentMeldCount),
        bestDiscard: null,
      };
    }
    if (action.type === "minGang") {
      return { action, supported: false, shape: null, bestDiscard: null };
    }
    return evaluateClaim(view, action);
  });
  if (winning) return { action: winning, candidates };

  const pass = candidates.find(
    (candidate): candidate is StructuralClaimCandidate & { shape: StructuralShape } =>
      candidate.action.type === "pass" && candidate.shape !== null,
  );
  const bestClaim = candidates
    .filter(
      (candidate): candidate is StructuralClaimCandidate & { shape: StructuralShape } =>
        (candidate.action.type === "chi" || candidate.action.type === "peng") &&
        candidate.supported &&
        candidate.shape !== null,
    )
    .sort(
      (left, right) =>
        compareShape(left.shape, right.shape) || compareAction(left.action, right.action),
    )[0];
  if (!bestClaim) return { action: pass?.action, candidates };
  if (!pass || compareShape(bestClaim.shape, pass.shape) < 0) {
    return { action: bestClaim.action, candidates };
  }
  return { action: pass.action, candidates };
};

export const recommendStructuralClaim = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): ClaimOrPass | undefined => evaluateStructuralClaim(view, legalActions).action;
