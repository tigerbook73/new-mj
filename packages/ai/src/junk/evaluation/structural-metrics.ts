import { STANDARD_TILE_SET, evaluateUkeire, type TileId, type TileKind } from "@new-mj/core";
import type { CalibrationEvaluationResult } from "../../evaluation/types.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";

export type StructuralMetrics = Readonly<{
  standardShanten: number;
  improvingKinds: readonly TileKind[];
  improvingKindCount: number;
  liveImprovingTileCount: number;
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
  for (const tile of visibleTiles) {
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
  const candidates = input.legalActions
    .filter((action) => action.type === "discard")
    .map((action) => {
      const hand = input.view.hand.filter((tile) => tile !== action.tile);
      const analysis = evaluateUkeire(
        hand,
        { sevenPairs: false },
        STANDARD_TILE_SET,
        input.view.seats[input.view.seat]!.melds.length,
      );
      const metrics: StructuralMetrics = {
        standardShanten: analysis.shanten,
        improvingKinds: analysis.improvingKinds,
        improvingKindCount: analysis.improvingKinds.length,
        liveImprovingTileCount: analysis.improvingKinds.reduce(
          (sum, kind) =>
            sum + Math.max(0, STANDARD_TILE_SET.copiesPerKind - (visibleCounts.get(kind) ?? 0)),
          0,
        ),
      };
      return { candidateId: JSON.stringify(action), action, metrics };
    });

  return {
    scenarioId,
    evaluator: "standard-only",
    evaluatorVersion: "v1",
    candidates,
    performance: {
      durationMs: performance.now() - startedAt,
      cacheHits: 0,
      cacheMisses: 0,
    },
    status: "ok",
  };
};
