import { STANDARD_TILE_SET, type JunkAction, type JunkPlayerView, type TileId } from "@new-mj/core";
import {
  compareStructuralContinuation,
  evaluateStructuralContinuation,
  evaluateStructuralDiscard,
  type StructuralContinuation,
} from "./structural-discard.ts";

type TurnAction = Extract<JunkAction, { type: "discard" | "anGang" | "buGang" | "zimo" }>;
type GangAction = Extract<TurnAction, { type: "anGang" | "buGang" }>;

export type StructuralTurnCandidate = Readonly<{
  action: TurnAction;
  supported: boolean;
  drawKindCount: number | null;
  leafCount: number | null;
  immediateCompletionMass: number | null;
  conditionalExpectedBestShanten: number | null;
  conditionalExpectedBestLiveImprovingKindCount: number | null;
  conditionalExpectedBestLiveImprovingTileCount: number | null;
}>;

export type StructuralTurnResult = Readonly<{
  action: TurnAction | undefined;
  candidates: readonly StructuralTurnCandidate[];
  searchedDiscardCandidateCount: number;
}>;

const unsupported = (action: GangAction): StructuralTurnCandidate => ({
  action,
  supported: false,
  drawKindCount: null,
  leafCount: null,
  immediateCompletionMass: null,
  conditionalExpectedBestShanten: null,
  conditionalExpectedBestLiveImprovingKindCount: null,
  conditionalExpectedBestLiveImprovingTileCount: null,
});

const removeTiles = (hand: readonly TileId[], removed: readonly TileId[]): TileId[] | undefined => {
  const result = [...hand];
  for (const tile of removed) {
    const index = result.indexOf(tile);
    if (index < 0) return undefined;
    result.splice(index, 1);
  }
  return result;
};

const gangHand = (
  view: JunkPlayerView,
  action: GangAction,
): Readonly<{ hand: readonly TileId[]; meldCount: number }> | undefined => {
  const melds = view.seats[view.seat]!.melds;
  if (action.type === "anGang") {
    const tiles = view.hand
      .filter((tile) => STANDARD_TILE_SET.kindOf(tile) === action.kind)
      .slice(0, 4);
    const hand = tiles.length === 4 ? removeTiles(view.hand, tiles) : undefined;
    return hand ? { hand, meldCount: melds.length + 1 } : undefined;
  }
  const kind = STANDARD_TILE_SET.kindOf(action.tile);
  const peng = melds.some(
    (meld) => meld.type === "peng" && STANDARD_TILE_SET.kindOf(meld.tiles[0]!) === kind,
  );
  const hand = peng ? removeTiles(view.hand, [action.tile]) : undefined;
  return hand ? { hand, meldCount: melds.length } : undefined;
};

const evaluateGang = (view: JunkPlayerView, action: GangAction): StructuralTurnCandidate => {
  const transformed = gangHand(view, action);
  if (!transformed) return unsupported(action);
  const continuation = evaluateStructuralContinuation(
    view,
    transformed.hand,
    transformed.meldCount,
  );
  return continuation.drawKindCount > 0
    ? { action, supported: true, ...continuation }
    : unsupported(action);
};

const equivalentDiscardContinuation = (
  view: JunkPlayerView,
  action: GangAction,
): StructuralContinuation | undefined => {
  const tile =
    action.type === "buGang"
      ? action.tile
      : view.hand.find((candidate) => STANDARD_TILE_SET.kindOf(candidate) === action.kind);
  const hand = tile === undefined ? undefined : removeTiles(view.hand, [tile]);
  return hand
    ? evaluateStructuralContinuation(view, hand, view.seats[view.seat]!.melds.length)
    : undefined;
};

const actionOrder = (left: JunkAction, right: JunkAction): number =>
  JSON.stringify(left).localeCompare(JSON.stringify(right));

const asContinuation = (candidate: StructuralTurnCandidate): StructuralContinuation => ({
  drawKindCount: candidate.drawKindCount ?? 0,
  leafCount: candidate.leafCount ?? 0,
  immediateCompletionMass: candidate.immediateCompletionMass,
  conditionalExpectedBestShanten: candidate.conditionalExpectedBestShanten,
  conditionalExpectedBestLiveImprovingKindCount:
    candidate.conditionalExpectedBestLiveImprovingKindCount,
  conditionalExpectedBestLiveImprovingTileCount:
    candidate.conditionalExpectedBestLiveImprovingTileCount,
});

/** Shadow self-turn structural policy. Gang must strictly beat the best bounded discard. */
export const evaluateStructuralTurn = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): StructuralTurnResult => {
  const relevant = legalActions.filter(
    (action): action is TurnAction =>
      action.type === "discard" ||
      action.type === "anGang" ||
      action.type === "buGang" ||
      action.type === "zimo",
  );
  const winning = relevant.find((action) => action.type === "zimo");
  const discards = evaluateStructuralDiscard(view, relevant);
  const selectedDiscard = discards.candidates.find(
    ({ action }) => action.tile === discards.action?.tile,
  );
  const candidates = relevant.map((action): StructuralTurnCandidate => {
    if (action.type === "zimo") return { action, supported: true, ...unsupportedAggregate };
    if (action.type === "anGang" || action.type === "buGang") return evaluateGang(view, action);
    const discard = discards.candidates.find(
      ({ action: candidate }) => candidate.tile === action.tile,
    );
    return {
      action,
      supported: discard?.searched ?? false,
      drawKindCount: null,
      leafCount: null,
      immediateCompletionMass: discard?.immediateCompletionMass ?? null,
      conditionalExpectedBestShanten: discard?.conditionalExpectedBestShanten ?? null,
      conditionalExpectedBestLiveImprovingKindCount:
        discard?.conditionalExpectedBestLiveImprovingKindCount ?? null,
      conditionalExpectedBestLiveImprovingTileCount:
        discard?.conditionalExpectedBestLiveImprovingTileCount ?? null,
    };
  });
  if (winning) {
    return {
      action: winning,
      candidates,
      searchedDiscardCandidateCount: discards.searchedCandidateCount,
    };
  }
  const gangDiscardBaselines = new Map(
    relevant.flatMap((action) => {
      if (action.type !== "anGang" && action.type !== "buGang") return [];
      const baseline = equivalentDiscardContinuation(view, action);
      return baseline ? [[JSON.stringify(action), baseline] as const] : [];
    }),
  );
  const bestGang = candidates
    .filter(
      (candidate): candidate is StructuralTurnCandidate & { action: GangAction } =>
        (candidate.action.type === "anGang" || candidate.action.type === "buGang") &&
        candidate.supported,
    )
    .filter((candidate) => {
      const baseline = gangDiscardBaselines.get(JSON.stringify(candidate.action));
      return baseline && compareStructuralContinuation(candidate, baseline) < 0;
    })
    .sort(
      (left, right) =>
        compareStructuralContinuation(asContinuation(left), asContinuation(right)) ||
        actionOrder(left.action, right.action),
    )[0];
  if (
    bestGang &&
    (!selectedDiscard || compareStructuralContinuation(bestGang, selectedDiscard) < 0)
  ) {
    return {
      action: bestGang.action,
      candidates,
      searchedDiscardCandidateCount: discards.searchedCandidateCount,
    };
  }
  return {
    action: discards.action,
    candidates,
    searchedDiscardCandidateCount: discards.searchedCandidateCount,
  };
};

const unsupportedAggregate = {
  drawKindCount: null,
  leafCount: null,
  immediateCompletionMass: null,
  conditionalExpectedBestShanten: null,
  conditionalExpectedBestLiveImprovingKindCount: null,
  conditionalExpectedBestLiveImprovingTileCount: null,
} as const;

export const recommendStructuralTurn = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): TurnAction | undefined => evaluateStructuralTurn(view, legalActions).action;
