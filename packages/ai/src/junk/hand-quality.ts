import { STANDARD_TILE_SET, type Meld, type TileId, type TileKind } from "@new-mj/core";
import {
  analyzeJunkHand,
  tileCountsOf,
  type JunkAnalysisCache,
  type ShapeInput,
} from "./analysis.ts";
import { probabilityAtLeastOneDraw } from "./tile-probability.ts";
import { DEFAULT_JUNK_WEIGHTS, type JunkWeights } from "./weights.ts";

export type LiveCopyContext = Readonly<{
  meldCounts: Uint8Array;
  discardCounts: Uint8Array;
}>;

export type GameProgress = Readonly<{
  wallCount: number;
  /** Wall plus opponents' concealed hands: tiles whose identity this seat cannot see. */
  unseenPoolSize: number;
}>;

export const AMPLE_GAME_PROGRESS: GameProgress = {
  wallCount: STANDARD_TILE_SET.kinds.length * STANDARD_TILE_SET.copiesPerKind,
  unseenPoolSize: STANDARD_TILE_SET.kinds.length * STANDARD_TILE_SET.copiesPerKind,
};

const kindOf = (tile: TileId): TileKind => STANDARD_TILE_SET.kindOf(tile);

export const removeTiles = (
  hand: readonly TileId[],
  tiles: readonly TileId[],
): TileId[] | undefined => {
  const remaining = [...hand];
  for (const tile of tiles) {
    const index = remaining.indexOf(tile);
    if (index < 0) return undefined;
    remaining.splice(index, 1);
  }
  return remaining;
};

const fanPotential = (input: ShapeInput, weights: JunkWeights): number => {
  const all = [...input.hand, ...input.melds.flatMap((meld) => meld.tiles)].map(kindOf);
  const suits = new Set(all.filter((kind) => !kind.endsWith("z")).map((kind) => kind[1]));
  const hasHonor = all.some((kind) => kind.endsWith("z"));
  const opened = input.melds.some((meld) => meld.type !== "anGang");
  let score = opened ? 0 : weights.menqing;
  if (suits.size === 1) score += hasHonor ? weights.hunyise : weights.qingyise;
  if (input.melds.every((meld) => meld.type !== "chi")) {
    const counts = new Map<TileKind, number>();
    for (const tile of input.hand) counts.set(kindOf(tile), (counts.get(kindOf(tile)) ?? 0) + 1);
    score += [...counts.values()].filter((count) => count >= 2).length * weights.pairBonus;
    score += input.melds.filter((meld) => meld.type !== "chi").length * weights.meldBonus;
    score += weights.pengpenghu;
  }
  if (input.melds.length === 0) score += weights.qiduiPotential;
  return score;
};

const isolationPotential = (
  hand: readonly TileId[],
  weights: JunkWeights,
  referenceHand: readonly TileId[] = hand,
): number => {
  const counts = new Map<TileKind, number>();
  for (const tile of hand) counts.set(kindOf(tile), (counts.get(kindOf(tile)) ?? 0) + 1);
  const referenceCounts = new Map<TileKind, number>();
  for (const tile of referenceHand)
    referenceCounts.set(kindOf(tile), (referenceCounts.get(kindOf(tile)) ?? 0) + 1);
  let score = 0;
  for (const [kind, count] of counts) {
    if (count >= 2 || kind.endsWith("z")) continue;
    const rank = Number(kind[0]);
    const suit = kind[1];
    const hasNeighbor = [-2, -1, 1, 2].some(
      (offset) => (referenceCounts.get(`${rank + offset}${suit}` as TileKind) ?? 0) > 0,
    );
    if (!hasNeighbor) score += weights.isolationPotential;
  }
  return score;
};

export const remainingLiveCopies = (
  input: ShapeInput,
  kind: TileKind,
  visibleDiscards: readonly TileId[],
  context?: LiveCopyContext,
  handCounts?: Uint8Array,
): number => {
  const index = STANDARD_TILE_SET.kindIndexOf(kind);
  const known = context
    ? (handCounts ?? tileCountsOf(input.hand))[index]! +
      context.meldCounts[index]! +
      context.discardCounts[index]!
    : input.hand.filter((tile) => kindOf(tile) === kind).length +
      input.melds.flatMap((meld) => meld.tiles).filter((tile) => kindOf(tile) === kind).length +
      visibleDiscards.filter((tile) => kindOf(tile) === kind).length;
  return Math.max(0, STANDARD_TILE_SET.copiesPerKind - known);
};

const liveUkeireCount = (
  input: ShapeInput,
  kinds: readonly TileKind[],
  visibleDiscards: readonly TileId[],
  context?: LiveCopyContext,
): number => {
  const handCounts = tileCountsOf(input.hand);
  return kinds.reduce(
    (total, kind) => total + remainingLiveCopies(input, kind, visibleDiscards, context, handCounts),
    0,
  );
};

export const createLiveCopyContext = (
  input: ShapeInput,
  visibleDiscards: readonly TileId[],
  additionalMelds: readonly Meld[] = [],
): LiveCopyContext => ({
  meldCounts: tileCountsOf([
    ...input.melds.flatMap((meld) => meld.tiles),
    ...additionalMelds.flatMap((meld) => meld.tiles),
  ]),
  discardCounts: tileCountsOf(visibleDiscards),
});

export const handQuality = (
  input: ShapeInput,
  weights: JunkWeights,
  _memo?: Map<string, number>,
  visibleDiscards: readonly TileId[] = [],
  isolationReferenceHand: readonly TileId[] = input.hand,
  gameProgress: GameProgress = AMPLE_GAME_PROGRESS,
  liveCopyContext?: LiveCopyContext,
  analysisCache?: JunkAnalysisCache,
): number => {
  const analysis = analyzeJunkHand(input, analysisCache);
  const improvements = liveUkeireCount(
    input,
    analysis.improvingKinds,
    visibleDiscards,
    liveCopyContext,
  );
  const remainingDraws = Math.ceil(gameProgress.wallCount / 4);
  const wallShare =
    gameProgress.unseenPoolSize > 0
      ? (improvements * gameProgress.wallCount) / gameProgress.unseenPoolSize
      : 0;
  const tenpaiProbability = probabilityAtLeastOneDraw(
    gameProgress.wallCount,
    wallShare,
    remainingDraws,
  );
  return (
    -analysis.shanten * weights.shantenWeight +
    tenpaiProbability * weights.tenpaiProbabilityWeight +
    fanPotential(input, weights) +
    isolationPotential(input.hand, weights, isolationReferenceHand)
  );
};

export const scoreHandShapeAfterDiscard = (
  input: ShapeInput,
  discard: TileId,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  memo?: Map<string, number>,
  gameProgress: GameProgress = AMPLE_GAME_PROGRESS,
  liveCopyContext?: LiveCopyContext,
  analysisCache?: JunkAnalysisCache,
): number => {
  const hand = removeTiles(input.hand, [discard]);
  if (!hand) return Number.NEGATIVE_INFINITY;
  const safety = visibleDiscards.includes(discard) ? weights.safetyBonus : 0;
  return (
    handQuality(
      { hand, melds: input.melds },
      weights,
      memo,
      visibleDiscards,
      input.hand,
      gameProgress,
      liveCopyContext,
      analysisCache,
    ) + safety
  );
};

export const bestDiscardScore = (
  input: ShapeInput,
  visibleDiscards: readonly TileId[],
  weights: JunkWeights,
  memo: Map<string, number> | undefined,
  gameProgress: GameProgress,
  liveCopyContext?: LiveCopyContext,
  analysisCache?: JunkAnalysisCache,
  allowedKinds?: ReadonlySet<TileKind>,
): number => {
  const scores = new Map<TileKind, number>();
  let best = Number.NEGATIVE_INFINITY;
  for (const tile of input.hand) {
    const kind = kindOf(tile);
    if (allowedKinds && !allowedKinds.has(kind)) continue;
    const score =
      scores.get(kind) ??
      (() => {
        const calculated = scoreHandShapeAfterDiscard(
          input,
          tile,
          visibleDiscards,
          weights,
          memo,
          gameProgress,
          liveCopyContext,
          analysisCache,
        );
        scores.set(kind, calculated);
        return calculated;
      })();
    if (score > best) best = score;
  }
  return best;
};
