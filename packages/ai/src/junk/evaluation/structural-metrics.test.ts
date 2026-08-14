import { STANDARD_TILE_SET, type JunkAction, type TileId } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { CANONICAL_STRUCTURAL_EXPECTATIONS } from "./canonical-expectations.ts";
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  CANONICAL_PRODUCTION_SELECTION,
  JUNK_CALIBRATION_MANIFEST,
} from "./canonical-fixtures.ts";
import { evaluateStructuralMetrics, type StructuralMetrics } from "./structural-metrics.ts";

describe("StructuralMetrics", () => {
  it("reports unweighted standard-hand structure without selecting a candidate", () => {
    const result = evaluateStructuralMetrics(
      CANONICAL_PRODUCTION_SELECTION.scenario.id,
      CANONICAL_PRODUCTION_SELECTION.input,
    );

    expect(result.evaluator).toBe("standard-only");
    expect(result.evaluatorVersion).toBe("v2");
    expect(result.selectedCandidateId).toBeUndefined();
    expect(result.candidates).toHaveLength(14);
    expect(result.candidates.every(({ metrics }) => !Object.hasOwn(metrics, "score"))).toBe(true);
    expect(
      result.candidates.every(
        ({ metrics }) =>
          typeof metrics.standardShanten === "number" &&
          Array.isArray(metrics.improvingKinds) &&
          typeof metrics.improvingKindCount === "number" &&
          typeof metrics.liveImprovingKindCount === "number" &&
          typeof metrics.liveImprovingTileCount === "number" &&
          typeof metrics.sameShantenParetoFrontier === "boolean" &&
          Array.isArray(metrics.dominatedByCandidateIds),
      ),
    ).toBe(true);
  });

  it.each(CANONICAL_STRUCTURAL_EXPECTATIONS)(
    "confirms the human-reviewed $id relation",
    (expectation) => {
      const scenario = JUNK_CALIBRATION_MANIFEST.scenarios.find(
        ({ id }) => id === expectation.scenarioId,
      )!;
      const input = CANONICAL_JUNK_SCENARIO_PROVIDER.resolve(scenario).input;
      const result = evaluateStructuralMetrics(scenario.id, input);
      const byKind = new Map(
        result.candidates.map(({ action, metrics }) => [
          STANDARD_TILE_SET.kindOf((action as Extract<JunkAction, { type: "discard" }>).tile),
          metrics,
        ]),
      );
      const left = byKind.get(expectation.leftDiscard)! as StructuralMetrics;
      const right = byKind.get(expectation.rightDiscard)! as StructuralMetrics;

      expect(left).toMatchObject(expectation.leftMetrics);
      expect(right).toMatchObject(expectation.rightMetrics);
      if (expectation.relation === "lower-shanten-vs-wider-ukeire") {
        expect(left.standardShanten).toBeLessThan(right.standardShanten);
        expect(left.improvingKindCount).toBeLessThan(right.improvingKindCount);
        expect(left.liveImprovingKindCount).toBeLessThan(right.liveImprovingKindCount);
        expect(left.liveImprovingTileCount).toBeLessThan(right.liveImprovingTileCount);
      } else {
        expect(left.standardShanten).toBe(right.standardShanten);
        expect(left.liveImprovingKindCount).toBeGreaterThan(right.liveImprovingKindCount);
        expect(left.liveImprovingTileCount).toBeGreaterThan(right.liveImprovingTileCount);
        expect(left.dominatesCandidateIds).toContain(
          result.candidates.find(
            ({ action }) =>
              STANDARD_TILE_SET.kindOf(
                (action as Extract<JunkAction, { type: "discard" }>).tile,
              ) === expectation.rightDiscard,
          )!.candidateId,
        );
      }
    },
  );

  it("uses all public tiles to exclude exhausted kinds from live width", () => {
    const input = CANONICAL_PRODUCTION_SELECTION.input;
    const baseline = evaluateStructuralMetrics("visible-baseline", input);
    const candidate = baseline.candidates.find(({ metrics }) => {
      const structural = metrics as StructuralMetrics;
      return structural.improvingKinds.some(
        (kind) =>
          input.view.hand.filter((tile) => STANDARD_TILE_SET.kindOf(tile) === kind).length < 4,
      );
    })!;
    const baselineMetrics = candidate.metrics as StructuralMetrics;
    const exhaustedKind = baselineMetrics.improvingKinds.find(
      (kind) =>
        input.view.hand.filter((tile) => STANDARD_TILE_SET.kindOf(tile) === kind).length < 4,
    )!;
    const heldCopies = new Set(
      input.view.hand
        .filter((tile) => STANDARD_TILE_SET.kindOf(tile) === exhaustedKind)
        .map((tile) => tile % STANDARD_TILE_SET.copiesPerKind),
    );
    const publicTiles = Array.from({ length: STANDARD_TILE_SET.copiesPerKind }, (_, copy) => copy)
      .filter((copy) => !heldCopies.has(copy))
      .map(
        (copy) =>
          (STANDARD_TILE_SET.kindIndexOf(exhaustedKind) * STANDARD_TILE_SET.copiesPerKind +
            copy) as TileId,
      );
    const depletedInput = {
      ...input,
      view: {
        ...input.view,
        seats: input.view.seats.map((seat, index) =>
          index === 1
            ? { ...seat, discards: [...seat.discards, ...publicTiles.map((tile) => ({ tile }))] }
            : seat,
        ),
      },
    };
    const depleted = evaluateStructuralMetrics("visible-depleted", depletedInput);
    const depletedMetrics = depleted.candidates.find(
      ({ candidateId }) => candidateId === candidate.candidateId,
    )!.metrics as StructuralMetrics;

    expect(depletedMetrics.improvingKindCount).toBe(baselineMetrics.improvingKindCount);
    expect(depletedMetrics.liveImprovingKindCount).toBe(baselineMetrics.liveImprovingKindCount - 1);
    expect(depletedMetrics.liveImprovingTileCount).toBeLessThan(
      baselineMetrics.liveImprovingTileCount,
    );
  });

  it("counts a claimed discard TileId only once when it also appears in a meld", () => {
    const input = CANONICAL_PRODUCTION_SELECTION.input;
    const baseline = evaluateStructuralMetrics("claimed-baseline", input);
    const publicTile = 1 as TileId;
    const claimedInput = {
      ...input,
      view: {
        ...input.view,
        seats: input.view.seats.map((seat, index) => {
          if (index === 1)
            return {
              ...seat,
              discards: [...seat.discards, { tile: publicTile, claimedBy: 2 as const }],
            };
          if (index === 2)
            return {
              ...seat,
              melds: [
                ...seat.melds,
                {
                  type: "peng" as const,
                  tiles: [publicTile, 2 as TileId, 3 as TileId],
                  from: 1 as const,
                },
              ],
            };
          return seat;
        }),
      },
    };
    const claimed = evaluateStructuralMetrics("claimed", claimedInput);
    let checked = 0;
    for (const baselineCandidate of baseline.candidates) {
      const claimedCandidate = claimed.candidates.find(
        ({ candidateId }) => candidateId === baselineCandidate.candidateId,
      )!;
      const before = baselineCandidate.metrics as StructuralMetrics;
      const after = claimedCandidate.metrics as StructuralMetrics;
      if (before.improvingKinds.includes(STANDARD_TILE_SET.kindOf(publicTile))) {
        checked += 1;
        expect(before.liveImprovingTileCount - after.liveImprovingTileCount).toBe(3);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
