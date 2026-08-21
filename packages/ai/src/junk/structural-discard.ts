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
  pengPengHuShanten,
  type UkeireEvaluation,
} from "./shanten/index.ts";

/** `JunkPlayerView["seats"][number]["melds"][number]`'s `type` isn't
 * re-exported from core's public barrel on its own, so index into the view
 * shape to name it — same trick used wherever meld-type checks are needed
 * outside core. */
type JunkMeld = JunkPlayerView["seats"][number]["melds"][number];

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
  /** Only populated for searched candidates while pengpenghu is still live
   * (see `canPursuePengPengHu`); `null` otherwise. */
  pengPengHu: StructuralShape | null;
  searched: boolean;
  dominated: boolean;
  immediateCompletionMass: number | null;
  conditionalExpectedBestShanten: number | null;
  conditionalExpectedBestLiveImprovingKindCount: number | null;
  conditionalExpectedBestLiveImprovingTileCount: number | null;
  /** Only populated for searched candidates — see `compareFinal`'s doc for
   * where this sits in the tiebreak chain. */
  flush: StructuralShape | null;
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
 * `tileSet.kindIndexOf(tileSet.kindOf(tile))` equals `Math.floor(tile /
 * copiesPerKind)` (TileId encoding, see core `tiles.ts`) — same shortcut
 * `shanten.ts`'s own `countsOf` uses, to avoid the redundant kind-string round
 * trip in a loop that runs per candidate hand.
 */
const kindIndexCountsOf = (hand: readonly TileId[]): Uint8Array => {
  const counts = new Uint8Array(STANDARD_TILE_SET.kinds.length);
  for (const tile of hand) counts[Math.floor(tile / STANDARD_TILE_SET.copiesPerKind)]! += 1;
  return counts;
};

const pairsAndKindsHeldOf = (counts: Uint8Array): { pairs: number; kindsHeld: number } => {
  let pairs = 0;
  let kindsHeld = 0;
  for (const count of counts) {
    if (count >= 2) pairs += 1;
    if (count > 0) kindsHeld += 1;
  }
  return { pairs, kindsHeld };
};

/** Any declared chi permanently forecloses pengpenghu (core's scoring.ts
 * `isPengPengHu`); peng/minGang/anGang/buGang stay compatible, unlike seven
 * pairs (any meld forecloses it) — so this route needs its own liveness check. */
const canPursuePengPengHu = (melds: readonly JunkMeld[]): boolean =>
  melds.every((meld) => meld.type !== "chi");

/**
 * All-triplets (pengpenghu) route shape for one candidate hand. Unlike the
 * seven-pairs combine above, `pengPengHuShanten` is a closed-form formula
 * (no DP, see its doc in shanten.ts), so there's no batched-prober version to
 * reuse here — this recomputes per candidate kind directly, mirroring
 * `structural-routes.ts`'s `sevenPairsShapeOf`. Scoped to the discard
 * shortlist only (this function's only call site), matching every other
 * route added here's discipline of keeping new signals out of the 2-ply
 * continuation loop, not because this one specifically measured expensive.
 */
const pengPengHuShapeOf = (
  hand: readonly TileId[],
  visibleCounts: ReadonlyMap<TileKind, number>,
  existingMelds: number,
): StructuralShape => {
  const shanten = pengPengHuShanten(hand, STANDARD_TILE_SET, existingMelds);
  const heldCounts = new Map<TileKind, number>();
  for (const tile of hand) {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    heldCounts.set(kind, (heldCounts.get(kind) ?? 0) + 1);
  }
  let liveImprovingKindCount = 0;
  let liveImprovingTileCount = 0;
  for (const kind of STANDARD_TILE_SET.kinds) {
    const held = heldCounts.get(kind) ?? 0;
    if (held >= STANDARD_TILE_SET.copiesPerKind) continue;
    const afterDraw = [...hand, tileIdOf(kind, held)];
    if (pengPengHuShanten(afterDraw, STANDARD_TILE_SET, existingMelds) >= shanten) continue;
    const liveCopies = Math.max(
      0,
      STANDARD_TILE_SET.copiesPerKind - (visibleCounts.get(kind) ?? 0),
    );
    if (liveCopies > 0) liveImprovingKindCount += 1;
    liveImprovingTileCount += liveCopies;
  }
  return { standardShanten: shanten, liveImprovingKindCount, liveImprovingTileCount };
};

/**
 * Combines an *already-computed* standard-only analysis with the (handicapped)
 * seven-pairs route for one candidate hand — `parentCounts` minus one copy of
 * `removedKindIndex` (or `parentCounts` as-is when `removedKindIndex < 0`, for
 * a caller with nothing to remove, e.g. the claim `pass` comparison). Pure
 * O(kinds) arithmetic on a shared counts array — no DP call, no per-candidate
 * allocation or rebuild from the tile list — so batched callers (discard
 * shortlist, 2-ply leaves) can share one `evaluateUkeireAfterDiscards` prober
 * build *and* one counts/pairs/kindsHeld computation of the pre-removal hand
 * across every candidate, paying only an O(1) delta per candidate instead of
 * re-scanning the whole hand (this combine step showed up as expensive as the
 * DP itself in profiling when it was rebuilding a fresh `Map` per candidate —
 * see the commit that introduced this counts-array version).
 *
 * `sevenPairsHandicapFor(pairs)` gets added to the seven-pairs side before the
 * minimum — it must beat standard by more than the handicap to change the
 * comparison; the handicap shrinks to 0 once the hand is a real enough bet on
 * the shape (see that function's doc). The handicap is fixed from *this*
 * candidate's own resulting pair count, not the pre-removal parent's.
 * Reimplements the seven-pairs side of the combine by hand (O(1) incremental
 * pairs/kinds update, mirroring `shanten.ts`'s own internal fast path) instead
 * of using `evaluateUkeire`'s built-in `{ sevenPairs: true }` option, which has
 * no handicap parameter and always takes the raw, unhandicapped minimum.
 */
const combineWithSevenPairsHandicap = (
  standardAnalysis: UkeireEvaluation,
  parentCounts: Uint8Array,
  parentPairs: number,
  parentKindsHeld: number,
  removedKindIndex: number,
  visibleCounts: ReadonlyMap<TileKind, number>,
): StructuralShape => {
  const removedCount = removedKindIndex >= 0 ? parentCounts[removedKindIndex]! : 0;
  const pairs = removedCount === 2 ? parentPairs - 1 : parentPairs;
  const kindsHeld = removedCount === 1 ? parentKindsHeld - 1 : parentKindsHeld;
  const handicap = sevenPairsHandicapFor(pairs);
  const sevenPairsCurrent = 6 - pairs + Math.max(0, 7 - kindsHeld);
  const combinedCurrent = Math.min(standardAnalysis.shanten, sevenPairsCurrent + handicap);
  // Index-keyed flag array instead of `new Set(improvingKinds)` + string
  // membership checks — both allocation and lookup are hashless, and this
  // combine runs once per 2-ply leaf candidate (thousands of times per
  // decision), where Set's per-call construction overhead is what showed up
  // in profiling (see this function's doc for the profiling note).
  const standardImproving = new Uint8Array(STANDARD_TILE_SET.kinds.length);
  for (const kind of standardAnalysis.improvingKinds) {
    standardImproving[STANDARD_TILE_SET.kindIndexOf(kind)] = 1;
  }
  // Inlined instead of building an improvingKinds array and handing it to
  // structuralShapeFromUkeire (that helper's own .map/.filter/.reduce over
  // it) — StructuralShape only keeps two scalar aggregates, so materializing
  // the intermediate TileKind[] here just to immediately throw it away wastes
  // two more array allocations per candidate on top of this function's own
  // 34-kind scan (same profiling note as above: cheap in isolation, but this
  // scan runs per 2-ply leaf candidate, thousands of times per decision).
  let liveImprovingKindCount = 0;
  let liveImprovingTileCount = 0;
  for (let index = 0; index < STANDARD_TILE_SET.kinds.length; index += 1) {
    const held = parentCounts[index]! - (index === removedKindIndex ? 1 : 0);
    if (held >= STANDARD_TILE_SET.copiesPerKind) continue;
    const standardAfter = standardImproving[index]
      ? standardAnalysis.shanten - 1
      : standardAnalysis.shanten;
    const sevenPairsAfter =
      6 - (pairs + (held === 1 ? 1 : 0)) + Math.max(0, 7 - (kindsHeld + (held === 0 ? 1 : 0)));
    const combinedAfter = Math.min(standardAfter, sevenPairsAfter + handicap);
    if (combinedAfter >= combinedCurrent) continue;
    const kind = STANDARD_TILE_SET.kinds[index]!;
    const liveCopies = Math.max(
      0,
      STANDARD_TILE_SET.copiesPerKind - (visibleCounts.get(kind) ?? 0),
    );
    if (liveCopies > 0) liveImprovingKindCount += 1;
    liveImprovingTileCount += liveCopies;
  }
  return { standardShanten: combinedCurrent, liveImprovingKindCount, liveImprovingTileCount };
};

/** Single-hand convenience wrapper — for call sites with exactly one candidate
 * and no discard to remove (e.g. the claim `pass` comparison), where there's
 * nothing to batch or delta from. */
const bestRouteShapeWithHandicap = (
  hand: readonly TileId[],
  visibleCounts: ReadonlyMap<TileKind, number>,
  existingMelds: number,
): StructuralShape => {
  const counts = kindIndexCountsOf(hand);
  const { pairs, kindsHeld } = pairsAndKindsHeldOf(counts);
  return combineWithSevenPairsHandicap(
    evaluateUkeire(hand, { sevenPairs: false }, STANDARD_TILE_SET, existingMelds),
    counts,
    pairs,
    kindsHeld,
    -1,
    visibleCounts,
  );
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

const NUMBER_SUITS = ["m", "p", "s"] as const;
type NumberSuit = (typeof NUMBER_SUITS)[number];

const suitOf = (kind: TileKind): NumberSuit | "z" =>
  kind.endsWith("z") ? "z" : (kind.charAt(1) as NumberSuit);

/**
 * Unlike seven pairs (any meld at all forecloses it) or menqing (any non-anGang
 * meld forecloses it), flush (清一色/混一色) only cares whether every already-
 * declared meld's tiles are themselves within the target suit (honors always
 * allowed either way — they're compatible with both the ×4 qingyise, no-honor
 * outcome and the ×2 hunyise, has-honor outcome; which one the final hand lands
 * on is a `scoring.ts`-time fact, not a pursuit-time choice, see
 * `docs/architecture/shanten.md`"清一色/混一色弃牌方向"节). A claimed meld in a
 * *different* suit permanently rules that suit out; melds already within the
 * target suit (or honor-only, e.g. an anGang of a wind/dragon) don't.
 */
const meldsAllowFlush = (melds: readonly JunkMeld[], suit: NumberSuit): boolean =>
  melds.every((meld) =>
    meld.tiles.every((tile) => {
      const tileSuit = suitOf(STANDARD_TILE_SET.kindOf(tile));
      return tileSuit === suit || tileSuit === "z";
    }),
  );

const filterToSuit = (hand: readonly TileId[], suit: NumberSuit): TileId[] =>
  hand.filter((tile) => {
    const tileSuit = suitOf(STANDARD_TILE_SET.kindOf(tile));
    return tileSuit === suit || tileSuit === "z";
  });

/**
 * Flush (清一色/混一色) shanten for a candidate target suit is standard shanten
 * computed on the *filtered* subset of the hand (target suit + honors only,
 * off-suit tiles simply omitted) — not a new algorithm: `evaluateUkeire` never
 * assumed its input is exactly 13/14 tiles, so feeding it a shorter, filtered
 * hand already answers "how many exchanges until this hand is confined to one
 * suit" (verified: for a near-flush hand, discarding an off-suit tile leaves
 * the filtered-subset shanten unchanged, discarding an on-suit tile makes it
 * worse — exactly the direction a flush-pursuing discard ranking needs). No
 * Layer 2 wildcard/joker extension needed (`docs/architecture/shanten.md`'s
 * "长期决策" §3 — that layer is for actual joker tiles, junk has none per
 * `docs/variants/junk.md` §1, and isn't what this needs anyway).
 *
 * Best of the standard route and the best-of-{m,p,s} flush route, for one
 * candidate hand — raw min, no handicap. Unlike the seven-pairs route (see
 * `sevenPairsHandicapFor`'s doc), which is wired pervasively into the
 * *primary* onePly/2-ply search where an unhandicapped min measurably
 * overrated it, flush here is only ever a late tiebreak among candidates the
 * 2-ply search already judged equally fast (see the two call sites' own doc
 * for exactly where — `evaluateStructuralDiscard`'s `candidates` map and
 * `compareFinal`). A `handicap ∈ {0,1,2}` arena sweep (200-seed position-
 * swapped self-play, `evaluateCandidatePolicies`) produced byte-identical
 * decisions and match outcomes at every value tried — the handicap dimension
 * is inert at this narrow integration scope, so it's dropped rather than kept
 * as dead complexity. See `docs/architecture/shanten.md`"清一色/混一色弃牌
 * 方向"节.
 *
 * Unlike seven pairs' O(1) incremental combine, flush shanten has no closed-
 * form formula — this calls `evaluateUkeire` once per suit still allowed by
 * the current melds (`meldsAllowFlush`), up to 3 extra shanten DPs per call.
 * Deliberately not called from the 2-ply continuation's per-leaf loop
 * (thousands of calls per decision) — that would repeat the seven-pairs
 * handicap's original per-candidate-DP mistake at a strictly worse multiplier
 * (a real DP per suit, not O(1) arithmetic); both actual call sites run at
 * most `maxFirstCandidates` (5) times per decision. First slice scope:
 * standard route only, no combination with seven pairs — flush and seven
 * pairs can co-occur in real scoring, but combining both routes' pursuit
 * logic in one slice was judged too much surface for a first cut.
 */
const bestFlushShapeOf = (
  hand: readonly TileId[],
  existingMelds: number,
  melds: readonly JunkMeld[],
  visibleCounts: ReadonlyMap<TileKind, number>,
): StructuralShape => {
  const standardShape = structuralShapeOf(hand, visibleCounts, existingMelds);
  let bestFlush: StructuralShape | undefined;
  for (const suit of NUMBER_SUITS) {
    if (!meldsAllowFlush(melds, suit)) continue;
    const analysis = evaluateUkeire(
      filterToSuit(hand, suit),
      { sevenPairs: false },
      STANDARD_TILE_SET,
      existingMelds,
    );
    const shape = structuralShapeFromUkeire(analysis, visibleCounts);
    if (!bestFlush || compareStructuralShape(shape, bestFlush) < 0) bestFlush = shape;
  }
  if (!bestFlush) return standardShape;
  return compareStructuralShape(bestFlush, standardShape) < 0 ? bestFlush : standardShape;
};

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
    const secondDiscardKindIndexes = secondDiscardActions.map((action) =>
      Math.floor(action.tile / STANDARD_TILE_SET.copiesPerKind),
    );
    // Batched over one shared createTwoChangeShantenProber build instead of one
    // full evaluateUkeire (fresh 4-suit DP) per second-discard candidate — see
    // docs/architecture/shanten.md "2-ply 批量结构 API". The seven-pairs
    // handicap combine (when eligible) reuses this same standard-only batch and
    // one afterDraw counts/pairs/kindsHeld computation shared across every
    // candidate — pure O(1) delta per candidate, no extra DP call or per-
    // candidate hand rebuild.
    const standardSecondDiscardBatch = evaluateUkeireAfterDiscards(
      afterDraw,
      secondDiscardKindIndexes,
      { sevenPairs: false },
      STANDARD_TILE_SET,
      existingMelds,
    );
    const afterDrawCounts = canPursueSevenPairs ? kindIndexCountsOf(afterDraw) : undefined;
    const afterDrawPairsAndKinds = afterDrawCounts
      ? pairsAndKindsHeldOf(afterDrawCounts)
      : undefined;
    const bestLeaf = standardSecondDiscardBatch
      .map((analysis, index) => {
        const action = secondDiscardActions[index]!;
        const shape =
          afterDrawCounts && afterDrawPairsAndKinds
            ? combineWithSevenPairsHandicap(
                analysis,
                afterDrawCounts,
                afterDrawPairsAndKinds.pairs,
                afterDrawPairsAndKinds.kindsHeld,
                secondDiscardKindIndexes[index]!,
                leafCounts,
              )
            : structuralShapeFromUkeire(analysis, leafCounts);
        return { action, shape };
      })
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

/**
 * `compareFinal`'s tiebreak chain, in order: continuation (2-ply, the primary
 * speed signal) first; flush next — it only decides between candidates the
 * 2-ply search already judged equally fast, never overrides a real speed
 * advantage; onePly next; pengpenghu last, gated by
 * `PENG_PENG_HU_TIEBREAK_SHANTEN_THRESHOLD` below. Below this pengpenghu
 * shanten, the route is far enough away that using it to break an otherwise-
 * genuine standard-route tie adds noise rather than signal (see the arena
 * sweep note next to this constant's test coverage) — same shape of problem
 * `sevenPairsHandicapFor` solves for seven pairs, chosen by the same A/B
 * methodology (200-seed position-swapped self-play). Both sides of the flush
 * comparison are always populated when this runs (only searched candidates
 * reach `compareFinal`, and searched candidates always get a `flush` shape —
 * see `evaluateStructuralDiscard`); the `null` fallback only guards the type.
 */
const PENG_PENG_HU_TIEBREAK_SHANTEN_THRESHOLD = 2;

const compareFinal = (
  left: StructuralDiscardCandidate,
  right: StructuralDiscardCandidate,
): number => {
  const pengPengHuTiebreakEligible =
    left.pengPengHu &&
    right.pengPengHu &&
    left.pengPengHu.standardShanten <= PENG_PENG_HU_TIEBREAK_SHANTEN_THRESHOLD &&
    right.pengPengHu.standardShanten <= PENG_PENG_HU_TIEBREAK_SHANTEN_THRESHOLD;
  return (
    compareStructuralContinuation(left, right) ||
    (left.flush && right.flush ? compareStructuralShape(left.flush, right.flush) : 0) ||
    compareStructuralShape(left.onePly, right.onePly) ||
    (pengPengHuTiebreakEligible
      ? compareStructuralShape(left.pengPengHu!, right.pengPengHu!)
      : 0) ||
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
  const pengPengHuViable = canPursuePengPengHu(view.seats[view.seat]!.melds);
  const discards = legalActions.filter(
    (action): action is Extract<JunkAction, { type: "discard" }> => action.type === "discard",
  );
  // One shared createTwoChangeShantenProber build over view.hand instead of one
  // full evaluateUkeire per discard candidate; results depend only on tile kind,
  // so duplicate-kind legal actions (rare with legalActions.length > 1 per kind)
  // share the same batch entry.
  const firstDiscardKindIndexes = [
    ...new Set(discards.map((action) => Math.floor(action.tile / STANDARD_TILE_SET.copiesPerKind))),
  ];
  // A discard never creates a meld, so it can't foreclose seven pairs on its own —
  // eligibility only depends on melds already declared before this decision.
  const canPursueSevenPairs = existingMelds === 0;
  const standardFirstDiscardBatch = evaluateUkeireAfterDiscards(
    view.hand,
    firstDiscardKindIndexes,
    { sevenPairs: false },
    STANDARD_TILE_SET,
    existingMelds,
  );
  // The seven-pairs handicap combine (when eligible) reuses this same
  // standard-only batch and one view.hand counts/pairs/kindsHeld computation
  // shared across every candidate kind — pure O(1) delta per candidate, no
  // extra DP call or per-candidate hand rebuild.
  const handCounts = canPursueSevenPairs ? kindIndexCountsOf(view.hand) : undefined;
  const handPairsAndKinds = handCounts ? pairsAndKindsHeldOf(handCounts) : undefined;
  const onePlyByKindIndex = new Map(
    standardFirstDiscardBatch.map((analysis) => {
      if (!(handCounts && handPairsAndKinds)) {
        return [
          analysis.discardKindIndex,
          structuralShapeFromUkeire(analysis, visibleCounts),
        ] as const;
      }
      return [
        analysis.discardKindIndex,
        combineWithSevenPairsHandicap(
          analysis,
          handCounts,
          handPairsAndKinds.pairs,
          handPairsAndKinds.kindsHeld,
          analysis.discardKindIndex,
          visibleCounts,
        ),
      ] as const;
    }),
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
  const melds = view.seats[view.seat]!.melds;

  const candidates: StructuralDiscardCandidate[] = withDominance.map((candidate) => {
    if (!searchedActions.has(candidate.action.tile)) {
      return {
        ...candidate,
        pengPengHu: null,
        searched: false,
        immediateCompletionMass: null,
        conditionalExpectedBestShanten: null,
        conditionalExpectedBestLiveImprovingKindCount: null,
        conditionalExpectedBestLiveImprovingTileCount: null,
        flush: null,
      };
    }
    const afterFirstDiscard = view.hand.filter((tile) => tile !== candidate.action.tile);
    const continuation = evaluateStructuralContinuation(view, afterFirstDiscard, existingMelds);
    leafCount += continuation.leafCount;
    // Cheap here: at most maxFirstCandidates (5) searched candidates per
    // decision, vs the 2-ply leaf loop's thousands — see bestFlushShapeOf's
    // doc for why it's scoped out of that loop.
    const flush = bestFlushShapeOf(afterFirstDiscard, existingMelds, melds, visibleCounts);
    return {
      ...candidate,
      pengPengHu: pengPengHuViable
        ? pengPengHuShapeOf(afterFirstDiscard, visibleCounts, existingMelds)
        : null,
      searched: true,
      immediateCompletionMass: continuation.immediateCompletionMass,
      conditionalExpectedBestShanten: continuation.conditionalExpectedBestShanten,
      conditionalExpectedBestLiveImprovingKindCount:
        continuation.conditionalExpectedBestLiveImprovingKindCount,
      conditionalExpectedBestLiveImprovingTileCount:
        continuation.conditionalExpectedBestLiveImprovingTileCount,
      flush,
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
