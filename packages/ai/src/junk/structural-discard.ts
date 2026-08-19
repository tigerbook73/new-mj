import {
  STANDARD_TILE_SET,
  tileIdOf,
  type JunkAction,
  type JunkPlayerView,
  type TileId,
  type TileKind,
} from "@new-mj/core";
import {
  computeShanten,
  evaluateUkeire,
  evaluateUkeireAfterDiscards,
  type UkeireEvaluation,
} from "./shanten/index.ts";

export type StructuralShape = Readonly<{
  standardShanten: number;
  liveImprovingKindCount: number;
  liveImprovingTileCount: number;
}>;

/**
 * Seven pairs at a given raw shanten generally completes less reliably than
 * standard at the same shanten (narrower per-step ukeire — each pair only
 * accepts its own kind, vs standard's runs and triplets), so comparing the two
 * shanten numbers at face value overrates seven pairs, particularly early when
 * the hand isn't yet committed to the shape. Below 4 concealed pairs, seven
 * pairs must beat standard by more than 2 levels to win the comparison; at 4
 * the bar drops to 1 level; at/above 5 the raw (unhandicapped) minimum is
 * used, since by then the hand is a real enough bet that hedging it further
 * just throws away completions that would have paid off. Tiers chosen by
 * arena A/B (200-seed position-swapped self-play, `evaluateCandidatePolicies`)
 * against the unhandicapped and single-threshold variants — see
 * `docs/architecture/shanten.md`'s seven-pairs handicap note for the sweep.
 */
const sevenPairsHandicapFor = (pairs: number): number => (pairs < 4 ? 2 : pairs < 5 ? 1 : 0);

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

export type StructuralContinuation = Readonly<{
  drawKindCount: number;
  leafCount: number;
  immediateCompletionMass: number | null;
  conditionalExpectedBestShanten: number | null;
  conditionalExpectedBestLiveImprovingKindCount: number | null;
  conditionalExpectedBestLiveImprovingTileCount: number | null;
}>;

const DEFAULT_MAX_FIRST_CANDIDATES = 5;
const AGGREGATE_COMPARISON_EPSILON = 1e-12;

export const visibleStructuralTileIds = (view: JunkPlayerView): Set<TileId> =>
  new Set([
    ...view.hand,
    ...(view.lastDiscard ? [view.lastDiscard.tile] : []),
    ...view.seats.flatMap(({ melds, discards }) => [
      ...melds.flatMap(({ tiles }) => tiles),
      ...discards.map(({ tile }) => tile),
    ]),
  ]);

export const structuralVisibleKindCounts = (tiles: ReadonlySet<TileId>): Map<TileKind, number> => {
  const counts = new Map<TileKind, number>();
  for (const tile of tiles) {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
};

/**
 * Shared by both the single-hand path (`evaluateUkeire`) and the batched
 * discard-candidate path (`evaluateUkeireAfterDiscards`): both return the same
 * `{ shanten, improvingKinds }` shape, only the live-copy discount differs.
 */
const structuralShapeFromUkeire = (
  analysis: UkeireEvaluation,
  visibleCounts: ReadonlyMap<TileKind, number>,
): StructuralShape => {
  const liveCopies = analysis.improvingKinds.map((kind) =>
    Math.max(0, STANDARD_TILE_SET.copiesPerKind - (visibleCounts.get(kind) ?? 0)),
  );
  return {
    standardShanten: analysis.shanten,
    liveImprovingKindCount: liveCopies.filter((copies) => copies > 0).length,
    liveImprovingTileCount: liveCopies.reduce((sum, copies) => sum + copies, 0),
  };
};

export const structuralShapeOf = (
  hand: readonly TileId[],
  visibleCounts: ReadonlyMap<TileKind, number>,
  existingMelds: number,
): StructuralShape =>
  structuralShapeFromUkeire(
    evaluateUkeire(hand, { sevenPairs: false }, STANDARD_TILE_SET, existingMelds),
    visibleCounts,
  );

/** Standard-only shape under the player's current visible information set. */
export const evaluateVisibleStructuralShape = (
  view: JunkPlayerView,
  hand: readonly TileId[],
  existingMelds: number,
): StructuralShape =>
  structuralShapeOf(
    hand,
    structuralVisibleKindCounts(visibleStructuralTileIds(view)),
    existingMelds,
  );

/**
 * Combined standard/seven-pairs shape. `sevenPairsHandicapFor(pairs)` gets
 * added to the seven-pairs side before the minimum — it must beat standard by
 * more than the handicap to change the comparison; the handicap shrinks to 0
 * once the hand is a real enough bet on the shape (see that function's doc).
 * The handicap is fixed from *this* hand's current pair count for the whole
 * call, including every `improvingKinds` candidate — it does not get
 * re-evaluated per candidate even if a candidate would cross a threshold.
 * Reimplements the combine loop by hand (O(1) incremental pairs/kinds update,
 * mirroring `shanten.ts`'s own internal fast path) instead of using
 * `evaluateUkeire`'s built-in `{ sevenPairs: true }` option, which has no
 * handicap parameter and always takes the raw, unhandicapped minimum.
 */
const bestRouteShapeWithHandicap = (
  hand: readonly TileId[],
  visibleCounts: ReadonlyMap<TileKind, number>,
  existingMelds: number,
): StructuralShape => {
  const standardAnalysis = evaluateUkeire(hand, { sevenPairs: false }, STANDARD_TILE_SET, existingMelds);
  const heldCounts = new Map<TileKind, number>();
  for (const tile of hand) {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    heldCounts.set(kind, (heldCounts.get(kind) ?? 0) + 1);
  }
  let pairs = 0;
  const kindsHeld = heldCounts.size;
  for (const count of heldCounts.values()) if (count >= 2) pairs += 1;
  const handicap = sevenPairsHandicapFor(pairs);
  const sevenPairsCurrent = 6 - pairs + Math.max(0, 7 - kindsHeld);
  const combinedCurrent = Math.min(standardAnalysis.shanten, sevenPairsCurrent + handicap);
  const standardImproving = new Set(standardAnalysis.improvingKinds);
  const improvingKinds = STANDARD_TILE_SET.kinds.filter((kind) => {
    const held = heldCounts.get(kind) ?? 0;
    if (held >= STANDARD_TILE_SET.copiesPerKind) return false;
    const standardAfter = standardImproving.has(kind)
      ? standardAnalysis.shanten - 1
      : standardAnalysis.shanten;
    const sevenPairsAfter =
      6 - (pairs + (held === 1 ? 1 : 0)) + Math.max(0, 7 - (kindsHeld + (held === 0 ? 1 : 0)));
    const combinedAfter = Math.min(standardAfter, sevenPairsAfter + handicap);
    return combinedAfter < combinedCurrent;
  });
  return structuralShapeFromUkeire({ shanten: combinedCurrent, improvingKinds }, visibleCounts);
};

/**
 * Same as `evaluateVisibleStructuralShape`, but folds in the (handicapped)
 * seven-pairs route while `existingMelds === 0` still leaves it eligible (see
 * `evaluateStructuralContinuation`'s `canPursueSevenPairs` doc). Only meant for
 * comparisons where the action being ranked does not itself create a meld (e.g.
 * the claim `pass` candidate) — an action that does (chi/peng/minGang/gang) must
 * keep using the standard-only shape above, since taking it forecloses seven
 * pairs regardless of what this comparison says.
 */
export const evaluateVisibleStructuralShapeBestRoute = (
  view: JunkPlayerView,
  hand: readonly TileId[],
  existingMelds: number,
): StructuralShape => {
  const visibleCounts = structuralVisibleKindCounts(visibleStructuralTileIds(view));
  return existingMelds === 0
    ? bestRouteShapeWithHandicap(hand, visibleCounts, existingMelds)
    : structuralShapeOf(hand, visibleCounts, existingMelds);
};

export const compareStructuralShape = (left: StructuralShape, right: StructuralShape): number =>
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

/** Full fixed-budget draw -> best-discard continuation under the visible information set. */
export const evaluateStructuralContinuation = (
  view: JunkPlayerView,
  handBeforeDraw: readonly TileId[],
  existingMelds: number,
): StructuralContinuation => {
  const occupied = visibleStructuralTileIds(view);
  const visibleCounts = structuralVisibleKindCounts(occupied);
  const unknownTileCount = STANDARD_TILE_SET.size - occupied.size;
  if (unknownTileCount <= 0 || view.wallCount <= 0) {
    return {
      drawKindCount: 0,
      leafCount: 0,
      immediateCompletionMass: null,
      conditionalExpectedBestShanten: null,
      conditionalExpectedBestLiveImprovingKindCount: null,
      conditionalExpectedBestLiveImprovingTileCount: null,
    };
  }
  // Any meld (claim or self-declared gang) permanently forecloses the seven-pairs
  // route (core's own.melds.length === 0 win gate, docs/variants/junk.md §3) — a
  // fully concealed hand (existingMelds === 0) can still pursue either route, so
  // completion/continuation search below folds seven pairs in via the shanten
  // module's own combined-route option instead of only ever probing standard.
  const canPursueSevenPairs = existingMelds === 0;
  let drawKindCount = 0;
  let leafCount = 0;
  let completionMass = 0;
  let continuationMass = 0;
  let expectedShanten = 0;
  let expectedKinds = 0;
  let expectedTiles = 0;
  for (const kind of STANDARD_TILE_SET.kinds) {
    const remaining = Math.max(0, STANDARD_TILE_SET.copiesPerKind - (visibleCounts.get(kind) ?? 0));
    if (remaining === 0) continue;
    const drawnTile = Array.from({ length: STANDARD_TILE_SET.copiesPerKind }, (_, copy) =>
      tileIdOf(kind, copy),
    ).find((tile) => !occupied.has(tile));
    if (drawnTile === undefined) continue;
    drawKindCount += 1;
    const probability = remaining / unknownTileCount;
    const afterDraw = [...handBeforeDraw, drawnTile];
    if (
      computeShanten(
        afterDraw,
        { sevenPairs: canPursueSevenPairs },
        STANDARD_TILE_SET,
        undefined,
        existingMelds,
      ) < 0
    ) {
      completionMass += probability;
      continue;
    }
    const leafCounts = structuralVisibleKindCounts(new Set(occupied).add(drawnTile));
    const secondDiscardActions = uniqueDiscardActions(afterDraw);
    // Every concealed-hand candidate is re-evaluated individually here (loses
    // the shared-prober batching the standard-only branch below gets from
    // evaluateUkeireAfterDiscards) because the handicap needs each candidate's
    // own post-discard pair count, which the batched API has no hook for.
    const bestLeaf = canPursueSevenPairs
      ? secondDiscardActions
          .map((action) => ({
            action,
            shape: bestRouteShapeWithHandicap(
              afterDraw.filter((tile) => tile !== action.tile),
              leafCounts,
              existingMelds,
            ),
          }))
          .sort(
            (left, right) =>
              compareStructuralShape(left.shape, right.shape) ||
              compareAction(left.action, right.action),
          )[0]
      : // Batched over one shared createTwoChangeShantenProber build instead of one
        // full evaluateUkeire (fresh 4-suit DP) per second-discard candidate — see
        // docs/architecture/shanten.md "2-ply 批量结构 API".
        evaluateUkeireAfterDiscards(
          afterDraw,
          secondDiscardActions.map((action) =>
            STANDARD_TILE_SET.kindIndexOf(STANDARD_TILE_SET.kindOf(action.tile)),
          ),
          { sevenPairs: false },
          STANDARD_TILE_SET,
          existingMelds,
        )
          .map((analysis, index) => ({
            action: secondDiscardActions[index]!,
            shape: structuralShapeFromUkeire(analysis, leafCounts),
          }))
          .sort(
            (left, right) =>
              compareStructuralShape(left.shape, right.shape) ||
              compareAction(left.action, right.action),
          )[0];
    if (!bestLeaf) continue;
    leafCount += 1;
    continuationMass += probability;
    expectedShanten += probability * bestLeaf.shape.standardShanten;
    expectedKinds += probability * bestLeaf.shape.liveImprovingKindCount;
    expectedTiles += probability * bestLeaf.shape.liveImprovingTileCount;
  }
  return {
    drawKindCount,
    leafCount,
    immediateCompletionMass: completionMass,
    conditionalExpectedBestShanten:
      continuationMass > 0 ? expectedShanten / continuationMass : null,
    conditionalExpectedBestLiveImprovingKindCount:
      continuationMass > 0 ? expectedKinds / continuationMass : null,
    conditionalExpectedBestLiveImprovingTileCount:
      continuationMass > 0 ? expectedTiles / continuationMass : null,
  };
};

export const compareStructuralContinuation = (
  left: Pick<
    StructuralContinuation,
    | "immediateCompletionMass"
    | "conditionalExpectedBestShanten"
    | "conditionalExpectedBestLiveImprovingKindCount"
    | "conditionalExpectedBestLiveImprovingTileCount"
  >,
  right: Pick<
    StructuralContinuation,
    | "immediateCompletionMass"
    | "conditionalExpectedBestShanten"
    | "conditionalExpectedBestLiveImprovingKindCount"
    | "conditionalExpectedBestLiveImprovingTileCount"
  >,
): number => {
  const compareAggregate = (leftValue: number, rightValue: number): number =>
    leftValue === rightValue || Math.abs(leftValue - rightValue) <= AGGREGATE_COMPARISON_EPSILON
      ? 0
      : leftValue - rightValue;
  return (
    compareAggregate(right.immediateCompletionMass ?? -1, left.immediateCompletionMass ?? -1) ||
    compareAggregate(
      left.conditionalExpectedBestShanten ?? Number.POSITIVE_INFINITY,
      right.conditionalExpectedBestShanten ?? Number.POSITIVE_INFINITY,
    ) ||
    compareAggregate(
      right.conditionalExpectedBestLiveImprovingKindCount ?? -1,
      left.conditionalExpectedBestLiveImprovingKindCount ?? -1,
    ) ||
    compareAggregate(
      right.conditionalExpectedBestLiveImprovingTileCount ?? -1,
      left.conditionalExpectedBestLiveImprovingTileCount ?? -1,
    )
  );
};

const compareFinal = (
  left: StructuralDiscardCandidate,
  right: StructuralDiscardCandidate,
): number => {
  return (
    compareStructuralContinuation(left, right) ||
    compareStructuralShape(left.onePly, right.onePly) ||
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
  const occupied = visibleStructuralTileIds(view);
  const visibleCounts = structuralVisibleKindCounts(occupied);
  const existingMelds = view.seats[view.seat]!.melds.length;
  const discards = legalActions.filter(
    (action): action is Extract<JunkAction, { type: "discard" }> => action.type === "discard",
  );
  // One shared createTwoChangeShantenProber build over view.hand instead of one
  // full evaluateUkeire per discard candidate; results depend only on tile kind,
  // so duplicate-kind legal actions (rare with legalActions.length > 1 per kind)
  // share the same batch entry.
  const firstDiscardKindIndexes = [
    ...new Set(
      discards.map((action) =>
        STANDARD_TILE_SET.kindIndexOf(STANDARD_TILE_SET.kindOf(action.tile)),
      ),
    ),
  ];
  // A discard never creates a meld, so it can't foreclose seven pairs on its own —
  // eligibility only depends on melds already declared before this decision.
  const canPursueSevenPairs = existingMelds === 0;
  // Same per-candidate re-evaluation tradeoff as evaluateStructuralContinuation's
  // bestLeaf above: each discard kind needs its own post-discard pair count for
  // the handicap, which evaluateUkeireAfterDiscards' batched API has no hook for.
  const onePlyByKindIndex = canPursueSevenPairs
    ? new Map(
        firstDiscardKindIndexes.map((kindIndex) => {
          const kind = STANDARD_TILE_SET.kinds[kindIndex]!;
          const tileToRemove = view.hand.find((tile) => STANDARD_TILE_SET.kindOf(tile) === kind)!;
          const resultingHand = view.hand.filter((tile) => tile !== tileToRemove);
          return [
            kindIndex,
            bestRouteShapeWithHandicap(resultingHand, visibleCounts, existingMelds),
          ] as const;
        }),
      )
    : new Map(
        evaluateUkeireAfterDiscards(
          view.hand,
          firstDiscardKindIndexes,
          { sevenPairs: false },
          STANDARD_TILE_SET,
          existingMelds,
        ).map((analysis) => [
          analysis.discardKindIndex,
          structuralShapeFromUkeire(analysis, visibleCounts),
        ]),
      );
  const base = discards.map((action) => ({
    action,
    onePly: onePlyByKindIndex.get(
      STANDARD_TILE_SET.kindIndexOf(STANDARD_TILE_SET.kindOf(action.tile)),
    )!,
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
          compareStructuralShape(left.onePly, right.onePly) ||
          compareAction(left.action, right.action),
      )
      .slice(0, maxFirstCandidates)
      .map(({ action }) => action.tile),
  );
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
    const continuation = evaluateStructuralContinuation(view, afterFirstDiscard, existingMelds);
    leafCount += continuation.leafCount;
    return {
      ...candidate,
      searched: true,
      immediateCompletionMass: continuation.immediateCompletionMass,
      conditionalExpectedBestShanten: continuation.conditionalExpectedBestShanten,
      conditionalExpectedBestLiveImprovingKindCount:
        continuation.conditionalExpectedBestLiveImprovingKindCount,
      conditionalExpectedBestLiveImprovingTileCount:
        continuation.conditionalExpectedBestLiveImprovingTileCount,
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
