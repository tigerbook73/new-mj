import { STANDARD_TILE_SET, type JunkAction } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCTION_SELECTION } from "./canonical-fixtures.ts";
import { evaluateStructuralMetrics } from "./structural-metrics.ts";

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

  it("exposes a canonical candidate difference through standard structure", () => {
    const result = evaluateStructuralMetrics(
      CANONICAL_PRODUCTION_SELECTION.scenario.id,
      CANONICAL_PRODUCTION_SELECTION.input,
    );
    const byKind = new Map(
      result.candidates.map(({ action, metrics }) => [
        STANDARD_TILE_SET.kindOf((action as Extract<JunkAction, { type: "discard" }>).tile),
        metrics,
      ]),
    );

    expect(byKind.get("5p")).toMatchObject({
      standardShanten: 2,
      improvingKindCount: 15,
      liveImprovingTileCount: 50,
    });
    expect(byKind.get("3m")).toMatchObject({
      standardShanten: 3,
      improvingKindCount: 16,
      liveImprovingTileCount: 53,
    });
    expect(byKind.size).toBe(14);
  });
});
