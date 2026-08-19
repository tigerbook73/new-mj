import {
  STANDARD_TILE_SET,
  type JunkAction,
  type JunkPlayerView,
  type TileId,
  type TileKind,
} from "@new-mj/core";
import {
  compareStructuralShape,
  evaluateStructuralContinuation,
  evaluateVisibleStructuralShape,
  evaluateVisibleStructuralShapeBestRoute,
  type StructuralShape,
} from "./structural-discard.ts";

type SupportedClaim = Extract<JunkAction, { type: "chi" | "peng" }>;
type ClaimOrPass = Extract<JunkAction, { type: "chi" | "peng" | "minGang" | "pass" | "hu" }>;

export type StructuralClaimCandidate = Readonly<{
  action: ClaimOrPass;
  supported: boolean;
  shape: StructuralShape | null;
  bestDiscard: TileId | null;
  drawKindCount: number;
  leafCount: number;
  immediateCompletionMass: number | null;
  conditionalExpectedBestShanten: number | null;
  conditionalExpectedBestLiveImprovingKindCount: number | null;
  conditionalExpectedBestLiveImprovingTileCount: number | null;
}>;

export type StructuralClaimResult = Readonly<{
  action: ClaimOrPass | undefined;
  candidates: readonly StructuralClaimCandidate[];
}>;

const AGGREGATE_COMPARISON_EPSILON = 1e-12;
const emptyAggregate = {
  drawKindCount: 0,
  leafCount: 0,
  immediateCompletionMass: null,
  conditionalExpectedBestShanten: null,
  conditionalExpectedBestLiveImprovingKindCount: null,
  conditionalExpectedBestLiveImprovingTileCount: null,
} as const;

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
    return { action, supported: false, shape: null, bestDiscard: null, ...emptyAggregate };
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
      (left, right) =>
        compareStructuralShape(left.shape, right.shape) || left.discard - right.discard,
    )[0];
  return best
    ? {
        action,
        supported: true,
        shape: best.shape,
        bestDiscard: best.discard,
        ...emptyAggregate,
      }
    : { action, supported: false, shape: null, bestDiscard: null, ...emptyAggregate };
};

const evaluateMinGang = (
  view: JunkPlayerView,
  action: Extract<JunkAction, { type: "minGang" }>,
): StructuralClaimCandidate => {
  const claimedKind = view.lastDiscard ? kindOf(view.lastDiscard.tile) : undefined;
  const matching = claimedKind
    ? view.hand.filter((tile) => kindOf(tile) === claimedKind).slice(0, 3)
    : [];
  const afterClaim = matching.length === 3 ? removeTiles(view.hand, matching) : undefined;
  if (!afterClaim) {
    return { action, supported: false, shape: null, bestDiscard: null, ...emptyAggregate };
  }

  const meldCount = view.seats[view.seat]!.melds.length + 1;
  const continuation = evaluateStructuralContinuation(view, afterClaim, meldCount);
  if (continuation.drawKindCount === 0) {
    return { action, supported: false, shape: null, bestDiscard: null, ...emptyAggregate };
  }
  return {
    action,
    supported: true,
    shape: null,
    bestDiscard: null,
    ...continuation,
  };
};

type ClaimRank = Readonly<{
  completionMass: number;
  shanten: number;
  kinds: number;
  tiles: number;
}>;

const rankOf = (candidate: StructuralClaimCandidate): ClaimRank | undefined => {
  if (!candidate.supported) return undefined;
  if (candidate.action.type === "minGang") {
    return {
      completionMass: candidate.immediateCompletionMass ?? 0,
      shanten: candidate.conditionalExpectedBestShanten ?? -1,
      kinds: candidate.conditionalExpectedBestLiveImprovingKindCount ?? 0,
      tiles: candidate.conditionalExpectedBestLiveImprovingTileCount ?? 0,
    };
  }
  if (!candidate.shape) return undefined;
  return {
    completionMass: 0,
    shanten: candidate.shape.standardShanten,
    kinds: candidate.shape.liveImprovingKindCount,
    tiles: candidate.shape.liveImprovingTileCount,
  };
};

const compareRank = (left: ClaimRank, right: ClaimRank): number => {
  const compare = (leftValue: number, rightValue: number): number =>
    leftValue === rightValue || Math.abs(leftValue - rightValue) <= AGGREGATE_COMPARISON_EPSILON
      ? 0
      : leftValue - rightValue;
  return (
    compare(right.completionMass, left.completionMass) ||
    compare(left.shanten, right.shanten) ||
    compare(right.kinds, left.kinds) ||
    compare(right.tiles, left.tiles)
  );
};

/** Shadow structural claim policy. Claims must strictly improve over pass. */
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
    if (action.type === "hu") {
      return { action, supported: true, shape: null, bestDiscard: null, ...emptyAggregate };
    }
    if (action.type === "pass") {
      // Passing doesn't create a meld, so it keeps whichever route (standard or
      // seven pairs) is currently ahead alive — chi/peng/minGang below always
      // create one and must stay standard-only, since taking them forecloses
      // seven pairs regardless of this comparison.
      return {
        action,
        supported: true,
        shape: evaluateVisibleStructuralShapeBestRoute(view, view.hand, currentMeldCount),
        bestDiscard: null,
        ...emptyAggregate,
      };
    }
    if (action.type === "minGang") return evaluateMinGang(view, action);
    return evaluateClaim(view, action);
  });
  if (winning) return { action: winning, candidates };

  const pass = candidates.find((candidate) => candidate.action.type === "pass");
  const passRank = pass ? rankOf(pass) : undefined;
  const bestClaim = candidates
    .filter(
      (candidate) =>
        candidate.action.type === "chi" ||
        candidate.action.type === "peng" ||
        candidate.action.type === "minGang",
    )
    .filter((candidate) => rankOf(candidate) !== undefined)
    .sort(
      (left, right) =>
        compareRank(rankOf(left)!, rankOf(right)!) || compareAction(left.action, right.action),
    )[0];
  if (!bestClaim) return { action: pass?.action, candidates };
  if (!pass || !passRank || compareRank(rankOf(bestClaim)!, passRank) < 0) {
    return { action: bestClaim.action, candidates };
  }
  return { action: pass.action, candidates };
};

export const recommendStructuralClaim = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): ClaimOrPass | undefined => evaluateStructuralClaim(view, legalActions).action;
