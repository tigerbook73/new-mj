import { STANDARD_TILE_SET, type JunkAction } from "@new-mj/core";
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
    expect(result.selectedCandidateId).toBeUndefined();
    expect(result.candidates).toHaveLength(14);
    expect(result.candidates.every(({ metrics }) => !Object.hasOwn(metrics, "score"))).toBe(true);
    expect(
      result.candidates.every(
        ({ metrics }) =>
          typeof metrics.standardShanten === "number" &&
          Array.isArray(metrics.improvingKinds) &&
          typeof metrics.improvingKindCount === "number" &&
          typeof metrics.liveImprovingTileCount === "number",
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
        expect(left.liveImprovingTileCount).toBeLessThan(right.liveImprovingTileCount);
      } else {
        expect(left.standardShanten).toBe(right.standardShanten);
        expect(left.improvingKindCount).toBeGreaterThan(right.improvingKindCount);
        expect(left.liveImprovingTileCount).toBeGreaterThan(right.liveImprovingTileCount);
      }
    },
  );
});
