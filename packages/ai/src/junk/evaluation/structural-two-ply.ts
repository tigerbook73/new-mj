import {
  STANDARD_TILE_SET,
  tileIdOf,
  type JunkAction,
  type TileId,
  type TileKind,
} from "@new-mj/core";
import { computeShanten } from "../shanten/index.ts";
import type { CalibrationEvaluationResult } from "../../evaluation/types.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";
import { evaluateStructuralMetrics, type StructuralMetrics } from "./structural-metrics.ts";

type StructuralTwoPlyMetrics = Readonly<{
  drawKinds: readonly TileKind[];
  drawKindCount: number;
  drawProbabilityMass: number;
  immediateCompletionMass: number;
  continuationMass: number;
  conditionalExpectedBestShanten: number | null;
  secondDiscardCandidateCount: number;
  secondDiscardFrontierCount: number;
}>;

const visibleTileIds = (input: JunkProductionFixtureInput): Set<TileId> =>
  new Set([
    ...input.view.hand,
    ...input.view.seats.flatMap(({ melds, discards }) => [
      ...melds.flatMap(({ tiles }) => tiles),
      ...discards.map(({ tile }) => tile),
    ]),
  ]);

const uniqueDiscardActions = (hand: readonly TileId[]): JunkAction[] => {
  const seen = new Set<TileKind>();
  return hand.flatMap((tile) => {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    if (seen.has(kind)) return [];
    seen.add(kind);
    return [{ type: "discard" as const, tile }];
  });
};

const hypotheticalInput = (
  input: JunkProductionFixtureInput,
  hand: readonly TileId[],
  firstDiscard: TileId,
  drawnTile: TileId,
): JunkProductionFixtureInput => ({
  view: {
    ...input.view,
    hand: [...hand],
    justDrawn: drawnTile,
    seats: input.view.seats.map((seat, index) =>
      index === input.view.seat
        ? {
            ...seat,
            handCount: hand.length,
            justDrawn: true,
            discards: [...seat.discards, { tile: firstDiscard }],
          }
        : seat,
    ),
  },
  legalActions: uniqueDiscardActions(hand),
});

/**
 * Pure structural two-ply diagnostic:
 * first discard -> estimated next self draw -> lowest-shanten second-discard Pareto frontier.
 * It deliberately has no first-action selector because the structural frontier is a partial order.
 */
export const evaluateStructuralTwoPlyAll = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
): CalibrationEvaluationResult => {
  const startedAt = performance.now();
  const occupied = visibleTileIds(input);
  const estimatedUnknownTileCount = STANDARD_TILE_SET.size - occupied.size;
  const existingMelds = input.view.seats[input.view.seat]!.melds.length;
  const candidates = input.legalActions
    .filter(
      (action): action is Extract<JunkAction, { type: "discard" }> => action.type === "discard",
    )
    .map((action) => {
      const afterDiscard = input.view.hand.filter((tile) => tile !== action.tile);
      const drawKinds: TileKind[] = [];
      let drawProbabilityMass = 0;
      let immediateCompletionMass = 0;
      let continuationMass = 0;
      let expectedBestShanten = 0;
      let secondDiscardCandidateCount = 0;
      let secondDiscardFrontierCount = 0;

      if (estimatedUnknownTileCount > 0 && input.view.wallCount > 0) {
        for (const kind of STANDARD_TILE_SET.kinds) {
          const visibleCopies = [...occupied].filter(
            (tile) => STANDARD_TILE_SET.kindOf(tile) === kind,
          ).length;
          const remaining = Math.max(0, STANDARD_TILE_SET.copiesPerKind - visibleCopies);
          if (remaining === 0) continue;
          const drawnTile = Array.from({ length: STANDARD_TILE_SET.copiesPerKind }, (_, copy) =>
            tileIdOf(kind, copy),
          ).find((tile) => !occupied.has(tile));
          if (drawnTile === undefined) continue;
          const probability = remaining / estimatedUnknownTileCount;
          const afterDraw = [...afterDiscard, drawnTile];
          drawKinds.push(kind);
          drawProbabilityMass += probability;
          if (
            computeShanten(
              afterDraw,
              { sevenPairs: false },
              STANDARD_TILE_SET,
              undefined,
              existingMelds,
            ) < 0
          ) {
            immediateCompletionMass += probability;
            continue;
          }

          const leaf = evaluateStructuralMetrics(
            `${scenarioId}:${action.tile}:${kind}`,
            hypotheticalInput(input, afterDraw, action.tile, drawnTile),
          );
          const leafMetrics = leaf.candidates.map(({ metrics }) => metrics as StructuralMetrics);
          const bestShanten = Math.min(
            ...leafMetrics.map(({ standardShanten }) => standardShanten),
          );
          const bestLayer = leafMetrics.filter(
            ({ standardShanten }) => standardShanten === bestShanten,
          );
          continuationMass += probability;
          expectedBestShanten += probability * bestShanten;
          secondDiscardCandidateCount += leafMetrics.length;
          secondDiscardFrontierCount += bestLayer.filter(
            ({ sameShantenParetoFrontier }) => sameShantenParetoFrontier,
          ).length;
        }
      }

      const metrics: StructuralTwoPlyMetrics = {
        drawKinds,
        drawKindCount: drawKinds.length,
        drawProbabilityMass,
        immediateCompletionMass,
        continuationMass,
        conditionalExpectedBestShanten:
          continuationMass > 0 ? expectedBestShanten / continuationMass : null,
        secondDiscardCandidateCount,
        secondDiscardFrontierCount,
      };
      return { candidateId: JSON.stringify(action), action, metrics };
    });

  return {
    scenarioId,
    evaluator: "two-ply-structural-all",
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
