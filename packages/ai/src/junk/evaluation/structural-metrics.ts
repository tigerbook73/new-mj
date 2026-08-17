import { STANDARD_TILE_SET, evaluateUkeire, type TileId, type TileKind } from "@new-mj/core";
import type { CalibrationEvaluationResult } from "../../evaluation/types.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";
import { annotateStructuralPareto } from "./structural-pareto.ts";

export type StructuralMetrics = Readonly<{
  standardShanten: number;
  improvingKinds: readonly TileKind[];
  improvingKindCount: number;
  liveImprovingKindCount: number;
  liveImprovingTileCount: number;
  sameShantenParetoFrontier: boolean;
  dominatesCandidateIds: readonly string[];
  dominatedByCandidateIds: readonly string[];
  tiedCandidateIds: readonly string[];
  incomparableCandidateIds: readonly string[];
}>;

const kindOf = (tile: TileId): TileKind => STANDARD_TILE_SET.kindOf(tile);

const visibleKindCounts = (input: JunkProductionFixtureInput): Map<TileKind, number> => {
  const counts = new Map<TileKind, number>();
  const visibleTiles = [
    ...input.view.hand,
    ...input.view.seats.flatMap(({ melds, discards }) => [
      ...melds.flatMap(({ tiles }) => tiles),
      ...discards.map(({ tile }) => tile),
    ]),
  ];
  for (const tile of new Set(visibleTiles)) {
    const kind = kindOf(tile);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
};

/**
 * Read-only standard-hand diagnostics from the player's information set.
 * `liveImprovingTileCount` is an unseen-copy estimate, not a wall truth or win probability.
 */
export const evaluateStructuralMetrics = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
): CalibrationEvaluationResult => {
  const startedAt = performance.now();
  const visibleCounts = visibleKindCounts(input);
  const candidatesWithoutPareto = input.legalActions
    .filter((action) => action.type === "discard")
    .map((action) => {
      const hand = input.view.hand.filter((tile) => tile !== action.tile);
      const analysis = evaluateUkeire(
        hand,
        { sevenPairs: false },
        STANDARD_TILE_SET,
        input.view.seats[input.view.seat]!.melds.length,
      );
      const liveImprovingCopies = analysis.improvingKinds.map((kind) => ({
        kind,
        copies: Math.max(0, STANDARD_TILE_SET.copiesPerKind - (visibleCounts.get(kind) ?? 0)),
      }));
      const metrics = {
        standardShanten: analysis.shanten,
        improvingKinds: analysis.improvingKinds,
        improvingKindCount: analysis.improvingKinds.length,
        liveImprovingKindCount: liveImprovingCopies.filter(({ copies }) => copies > 0).length,
        liveImprovingTileCount: liveImprovingCopies.reduce((sum, { copies }) => sum + copies, 0),
      };
      return { candidateId: JSON.stringify(action), action, metrics };
    });
  const pareto = annotateStructuralPareto(
    candidatesWithoutPareto.map(({ candidateId, metrics }) => ({
      candidateId,
      standardShanten: metrics.standardShanten,
      liveImprovingKindCount: metrics.liveImprovingKindCount,
      liveImprovingTileCount: metrics.liveImprovingTileCount,
    })),
  );
  const candidates = candidatesWithoutPareto.map((candidate) => ({
    ...candidate,
    metrics: {
      ...candidate.metrics,
      ...pareto.get(candidate.candidateId)!,
    } satisfies StructuralMetrics,
  }));

  return {
    scenarioId,
    evaluator: "standard-only",
    evaluatorVersion: "v2",
    candidates,
    performance: {
      durationMs: performance.now() - startedAt,
      cacheHits: 0,
      cacheMisses: 0,
    },
    status: "ok",
  };
};
