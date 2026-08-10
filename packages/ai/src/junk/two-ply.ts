import {
  STANDARD_TILE_SET,
  evaluateUkeireAfterDiscardDraws,
  evaluateUkeireBatch,
  tileIdOf,
  type Meld,
  type TileId,
  type TileKind,
} from "@new-mj/core";
import {
  createJunkAnalysisCache,
  junkHandAnalysisKey,
  type JunkAnalysisCache,
  type ShapeInput,
} from "./analysis.ts";
import {
  AMPLE_GAME_PROGRESS,
  bestDiscardScore,
  createLiveCopyContext,
  remainingLiveCopies,
  type GameProgress,
} from "./hand-quality.ts";
import { DEFAULT_JUNK_WEIGHTS, type JunkWeights } from "./weights.ts";

export type SelfDrawTwoPlyOutcome = Readonly<{
  kind: TileKind;
  probability: number;
  /** Undefined for an immediate win; terminal payout is intentionally unmodelled. */
  leafScore?: number;
}>;

export type SelfDrawTwoPlyProbe = Readonly<{
  continuationProbability: number;
  continuationValue: number;
  winProbability: number;
  secondDiscardCandidateCount: number;
  outcomes: readonly SelfDrawTwoPlyOutcome[];
}>;

export type TwoChangeBatchSource = Readonly<{
  tiles: readonly TileId[];
  discardKindIndex: number;
}>;

/**
 * Narrow continuation probe:
 * post-discard hand -> next self draw -> best subsequent discard -> leaf quality.
 * Immediate wins remain separate because this layer has no terminal payout model.
 */
export const probeSelfDrawTwoPly = (
  input: ShapeInput,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  gameProgress: GameProgress = AMPLE_GAME_PROGRESS,
  analysisCache?: JunkAnalysisCache,
  secondDiscardKindsForDraw?: (drawnKind: TileKind) => ReadonlySet<TileKind>,
  twoChangeBatchSource?: TwoChangeBatchSource,
  additionalMelds: readonly Meld[] = [],
): SelfDrawTwoPlyProbe => {
  if (gameProgress.unseenPoolSize <= 0 || gameProgress.wallCount <= 0)
    return {
      continuationProbability: 0,
      continuationValue: 0,
      winProbability: 0,
      secondDiscardCandidateCount: 0,
      outcomes: [],
    };

  const memo = new Map<string, number>();
  const structuralCache = analysisCache ?? createJunkAnalysisCache();
  const liveCopyContext = createLiveCopyContext(input, visibleDiscards, additionalMelds);
  let continuationProbability = 0;
  let continuationValue = 0;
  let winProbability = 0;
  let secondDiscardCandidateCount = 0;
  const outcomes: SelfDrawTwoPlyOutcome[] = [];
  const occupied = new Set([
    ...input.hand,
    ...input.melds.flatMap((meld) => meld.tiles),
    ...additionalMelds.flatMap((meld) => meld.tiles),
    ...visibleDiscards,
  ]);
  const drawCandidates: Array<{
    kind: TileKind;
    probability: number;
    afterDraw: ShapeInput;
  }> = [];
  for (const kind of STANDARD_TILE_SET.kinds) {
    const remaining = remainingLiveCopies(input, kind, visibleDiscards, liveCopyContext);
    if (remaining === 0) continue;
    const probability = remaining / gameProgress.unseenPoolSize;
    const drawnTile = Array.from({ length: STANDARD_TILE_SET.copiesPerKind }, (_, copy) =>
      tileIdOf(kind, copy),
    ).find((tile) => !occupied.has(tile));
    if (drawnTile === undefined) continue;
    drawCandidates.push({
      kind,
      probability,
      afterDraw: { hand: [...input.hand, drawnTile], melds: input.melds },
    });
  }
  const drawAnalyses = twoChangeBatchSource
    ? new Map(
        evaluateUkeireAfterDiscardDraws(
          twoChangeBatchSource.tiles,
          [twoChangeBatchSource.discardKindIndex],
          drawCandidates.map(({ kind }) => STANDARD_TILE_SET.kindIndexOf(kind)),
          { sevenPairs: input.melds.length === 0 },
          STANDARD_TILE_SET,
          input.melds.length,
        ).map((analysis) => [analysis.drawKindIndex, analysis] as const),
      )
    : undefined;
  const directDrawAnalyses = !twoChangeBatchSource
    ? evaluateUkeireBatch(
        drawCandidates.map(({ afterDraw }) => ({
          tiles: afterDraw.hand,
          options: { sevenPairs: afterDraw.melds.length === 0 },
          existingMelds: afterDraw.melds.length,
        })),
      )
    : undefined;

  for (const [index, { kind, probability, afterDraw }] of drawCandidates.entries()) {
    const analysis = twoChangeBatchSource
      ? drawAnalyses?.get(STANDARD_TILE_SET.kindIndexOf(kind))
      : directDrawAnalyses?.[index];
    if (!analysis) throw new Error("MISSING_TWO_CHANGE_ANALYSIS");
    if (!twoChangeBatchSource)
      structuralCache.set(junkHandAnalysisKey(afterDraw), directDrawAnalyses![index]!);
    if (analysis.shanten < 0) {
      winProbability += probability;
      outcomes.push({ kind, probability });
      continue;
    }

    const allowedSecondDiscardKinds = secondDiscardKindsForDraw?.(kind);
    secondDiscardCandidateCount += new Set(
      afterDraw.hand
        .filter(
          (tile) =>
            !allowedSecondDiscardKinds ||
            allowedSecondDiscardKinds.has(STANDARD_TILE_SET.kindOf(tile)),
        )
        .map((tile) => STANDARD_TILE_SET.kindOf(tile)),
    ).size;
    const leafScore = bestDiscardScore(
      afterDraw,
      visibleDiscards,
      weights,
      memo,
      gameProgress,
      liveCopyContext,
      structuralCache,
      allowedSecondDiscardKinds,
    );
    continuationProbability += probability;
    continuationValue += probability * leafScore;
    outcomes.push({ kind, probability, leafScore });
  }
  return {
    continuationProbability,
    continuationValue,
    winProbability,
    secondDiscardCandidateCount,
    outcomes,
  };
};
