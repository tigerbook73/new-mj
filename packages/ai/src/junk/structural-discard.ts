import {
  STANDARD_TILE_SET,
  computeShanten,
  evaluateUkeire,
  tileIdOf,
  type JunkAction,
  type JunkPlayerView,
  type TileId,
  type TileKind,
} from "@new-mj/core";

export type StructuralShape = Readonly<{
  standardShanten: number;
  liveImprovingKindCount: number;
  liveImprovingTileCount: number;
}>;

export type StructuralDiscardCandidate = Readonly<{
  action: Extract<JunkAction, { type: "discard" }>;
  onePly: StructuralShape;
  searched: boolean;
  dominated: boolean;
  immediateCompletionMass: number | null;
  conditionalExpectedBestShanten: number | null;
  conditionalExpectedBestLiveImprovingKindCount: number | null;
  conditionalExpectedBestLiveImprovingTileCount: number | null;
}>;

export type StructuralDiscardResult = Readonly<{
  action: Extract<JunkAction, { type: "discard" }> | undefined;
  candidates: readonly StructuralDiscardCandidate[];
  searchedCandidateCount: number;
  leafCount: number;
}>;

export type StructuralDiscardOptions = Readonly<{
  /** Infinity is the offline full-search teacher. Production candidates use a fixed operation budget. */
  maxFirstCandidates?: number;
  applyDominanceGuardrail?: boolean;
}>;

const DEFAULT_MAX_FIRST_CANDIDATES = 5;
const AGGREGATE_COMPARISON_EPSILON = 1e-12;

const visibleTileIds = (view: JunkPlayerView): Set<TileId> =>
  new Set([
    ...view.hand,
    ...(view.lastDiscard ? [view.lastDiscard.tile] : []),
    ...view.seats.flatMap(({ melds, discards }) => [
      ...melds.flatMap(({ tiles }) => tiles),
      ...discards.map(({ tile }) => tile),
    ]),
  ]);

const visibleKindCounts = (tiles: ReadonlySet<TileId>): Map<TileKind, number> => {
  const counts = new Map<TileKind, number>();
  for (const tile of tiles) {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
};

const shapeOf = (
  hand: readonly TileId[],
  visibleCounts: ReadonlyMap<TileKind, number>,
  existingMelds: number,
): StructuralShape => {
  const analysis = evaluateUkeire(hand, { sevenPairs: false }, STANDARD_TILE_SET, existingMelds);
  const liveCopies = analysis.improvingKinds.map((kind) =>
    Math.max(0, STANDARD_TILE_SET.copiesPerKind - (visibleCounts.get(kind) ?? 0)),
  );
  return {
    standardShanten: analysis.shanten,
    liveImprovingKindCount: liveCopies.filter((copies) => copies > 0).length,
    liveImprovingTileCount: liveCopies.reduce((sum, copies) => sum + copies, 0),
  };
};

/** Standard-only shape under the player's current visible information set. */
export const evaluateVisibleStructuralShape = (
  view: JunkPlayerView,
  hand: readonly TileId[],
  existingMelds: number,
): StructuralShape => shapeOf(hand, visibleKindCounts(visibleTileIds(view)), existingMelds);

const compareShape = (left: StructuralShape, right: StructuralShape): number =>
  left.standardShanten - right.standardShanten ||
  right.liveImprovingKindCount - left.liveImprovingKindCount ||
  right.liveImprovingTileCount - left.liveImprovingTileCount;

const compareAction = (
  left: Extract<JunkAction, { type: "discard" }>,
  right: Extract<JunkAction, { type: "discard" }>,
): number =>
  STANDARD_TILE_SET.kinds.indexOf(STANDARD_TILE_SET.kindOf(left.tile)) -
    STANDARD_TILE_SET.kinds.indexOf(STANDARD_TILE_SET.kindOf(right.tile)) || left.tile - right.tile;

const strictlyDominates = (left: StructuralShape, right: StructuralShape): boolean =>
  left.standardShanten === right.standardShanten &&
  left.liveImprovingKindCount >= right.liveImprovingKindCount &&
  left.liveImprovingTileCount >= right.liveImprovingTileCount &&
  (left.liveImprovingKindCount > right.liveImprovingKindCount ||
    left.liveImprovingTileCount > right.liveImprovingTileCount);

const uniqueDiscardActions = (
  hand: readonly TileId[],
): Extract<JunkAction, { type: "discard" }>[] => {
  const seen = new Set<TileKind>();
  return hand.flatMap((tile) => {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    if (seen.has(kind)) return [];
    seen.add(kind);
    return [{ type: "discard" as const, tile }];
  });
};

const compareFinal = (
  left: StructuralDiscardCandidate,
  right: StructuralDiscardCandidate,
): number => {
  const leftShanten = left.conditionalExpectedBestShanten ?? Number.POSITIVE_INFINITY;
  const rightShanten = right.conditionalExpectedBestShanten ?? Number.POSITIVE_INFINITY;
  const compareAggregate = (leftValue: number, rightValue: number): number =>
    leftValue === rightValue || Math.abs(leftValue - rightValue) <= AGGREGATE_COMPARISON_EPSILON
      ? 0
      : leftValue - rightValue;
  return (
    compareAggregate(right.immediateCompletionMass ?? -1, left.immediateCompletionMass ?? -1) ||
    compareAggregate(leftShanten, rightShanten) ||
    compareAggregate(
      right.conditionalExpectedBestLiveImprovingKindCount ?? -1,
      left.conditionalExpectedBestLiveImprovingKindCount ?? -1,
    ) ||
    compareAggregate(
      right.conditionalExpectedBestLiveImprovingTileCount ?? -1,
      left.conditionalExpectedBestLiveImprovingTileCount ?? -1,
    ) ||
    compareShape(left.onePly, right.onePly) ||
    compareAction(left.action, right.action)
  );
};

/**
 * Standard-hand-only deterministic discard policy. It uses visible unseen-copy estimates,
 * not wall truth, opponent inference, configurable weights, or evaluation-only code.
 */
export const evaluateStructuralDiscard = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
  options: StructuralDiscardOptions = {},
): StructuralDiscardResult => {
  const occupied = visibleTileIds(view);
  const visibleCounts = visibleKindCounts(occupied);
  const existingMelds = view.seats[view.seat]!.melds.length;
  const discards = legalActions.filter(
    (action): action is Extract<JunkAction, { type: "discard" }> => action.type === "discard",
  );
  const base = discards.map((action) => ({
    action,
    onePly: shapeOf(
      view.hand.filter((tile) => tile !== action.tile),
      visibleCounts,
      existingMelds,
    ),
  }));
  const applyGuardrail = options.applyDominanceGuardrail ?? true;
  const withDominance = base.map((candidate) => ({
    ...candidate,
    dominated:
      applyGuardrail && base.some((other) => strictlyDominates(other.onePly, candidate.onePly)),
  }));
  const maxFirstCandidates = options.maxFirstCandidates ?? DEFAULT_MAX_FIRST_CANDIDATES;
  const searchedActions = new Set(
    withDominance
      .filter(({ dominated }) => !dominated)
      .sort(
        (left, right) =>
          compareShape(left.onePly, right.onePly) || compareAction(left.action, right.action),
      )
      .slice(0, maxFirstCandidates)
      .map(({ action }) => action.tile),
  );
  const unknownTileCount = STANDARD_TILE_SET.size - occupied.size;
  let leafCount = 0;

  const candidates: StructuralDiscardCandidate[] = withDominance.map((candidate) => {
    if (!searchedActions.has(candidate.action.tile)) {
      return {
        ...candidate,
        searched: false,
        immediateCompletionMass: null,
        conditionalExpectedBestShanten: null,
        conditionalExpectedBestLiveImprovingKindCount: null,
        conditionalExpectedBestLiveImprovingTileCount: null,
      };
    }
    const afterFirstDiscard = view.hand.filter((tile) => tile !== candidate.action.tile);
    let completionMass = 0;
    let continuationMass = 0;
    let weightedShanten = 0;
    let weightedKinds = 0;
    let weightedTiles = 0;
    if (unknownTileCount > 0 && view.wallCount > 0) {
      for (const kind of STANDARD_TILE_SET.kinds) {
        const remaining = Math.max(
          0,
          STANDARD_TILE_SET.copiesPerKind - (visibleCounts.get(kind) ?? 0),
        );
        if (remaining === 0) continue;
        const drawnTile = Array.from({ length: STANDARD_TILE_SET.copiesPerKind }, (_, copy) =>
          tileIdOf(kind, copy),
        ).find((tile) => !occupied.has(tile));
        if (drawnTile === undefined) continue;
        const probability = remaining / unknownTileCount;
        const afterDraw = [...afterFirstDiscard, drawnTile];
        if (
          computeShanten(
            afterDraw,
            { sevenPairs: false },
            STANDARD_TILE_SET,
            undefined,
            existingMelds,
          ) < 0
        ) {
          completionMass += probability;
          continue;
        }
        const leafVisible = new Set(occupied).add(drawnTile);
        const leafCounts = visibleKindCounts(leafVisible);
        const bestLeaf = uniqueDiscardActions(afterDraw)
          .map((action) => ({
            action,
            shape: shapeOf(
              afterDraw.filter((tile) => tile !== action.tile),
              leafCounts,
              existingMelds,
            ),
          }))
          .sort(
            (left, right) =>
              compareShape(left.shape, right.shape) || compareAction(left.action, right.action),
          )[0];
        if (!bestLeaf) continue;
        leafCount += 1;
        continuationMass += probability;
        weightedShanten += probability * bestLeaf.shape.standardShanten;
        weightedKinds += probability * bestLeaf.shape.liveImprovingKindCount;
        weightedTiles += probability * bestLeaf.shape.liveImprovingTileCount;
      }
    }
    return {
      ...candidate,
      searched: true,
      immediateCompletionMass: completionMass,
      conditionalExpectedBestShanten:
        continuationMass > 0 ? weightedShanten / continuationMass : null,
      conditionalExpectedBestLiveImprovingKindCount:
        continuationMass > 0 ? weightedKinds / continuationMass : null,
      conditionalExpectedBestLiveImprovingTileCount:
        continuationMass > 0 ? weightedTiles / continuationMass : null,
    };
  });
  const selected = candidates.filter(({ searched }) => searched).sort(compareFinal)[0];
  return {
    action: selected?.action,
    candidates,
    searchedCandidateCount: searchedActions.size,
    leafCount,
  };
};

export const recommendStructuralDiscard = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): Extract<JunkAction, { type: "discard" }> | undefined =>
  evaluateStructuralDiscard(view, legalActions).action;
