import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCTION_SELECTION } from "./canonical-fixtures.ts";
import { evaluateStructuralTwoPlyAll } from "./structural-two-ply.ts";

describe("structural two-ply diagnostics", () => {
  it("reports every first discard without inventing a structural argmax", () => {
    const result = evaluateStructuralTwoPlyAll(
      CANONICAL_PRODUCTION_SELECTION.scenario.id,
      CANONICAL_PRODUCTION_SELECTION.input,
    );
    expect(result).toMatchObject({
      evaluator: "two-ply-structural-all",
      evaluatorVersion: "v1",
      status: "ok",
    });
    expect(result.selectedCandidateId).toBeUndefined();
    expect(result.candidates).toHaveLength(14);
    expect(
      result.candidates.every(
        ({ metrics }) => Math.abs(Number(metrics.drawProbabilityMass) - 1) < 1e-12,
      ),
    ).toBe(true);
    expect(
      result.candidates.every(
        ({ metrics }) =>
          Array.isArray(metrics.drawKinds) &&
          typeof metrics.drawKindCount === "number" &&
          typeof metrics.drawProbabilityMass === "number" &&
          typeof metrics.immediateCompletionMass === "number" &&
          typeof metrics.secondDiscardCandidateCount === "number" &&
          typeof metrics.secondDiscardFrontierCount === "number" &&
          !Object.hasOwn(metrics, "score"),
      ),
    ).toBe(true);
    expect(
      result.candidates.some(
        ({ metrics }) =>
          Number(metrics.secondDiscardCandidateCount) > Number(metrics.secondDiscardFrontierCount),
      ),
    ).toBe(true);
  });

  it("reports no draw branches when the wall is empty", () => {
    const input = CANONICAL_PRODUCTION_SELECTION.input;
    const result = evaluateStructuralTwoPlyAll("empty-wall", {
      ...input,
      view: { ...input.view, wallCount: 0 },
    });
    expect(
      result.candidates.every(
        ({ metrics }) =>
          metrics.drawKindCount === 0 &&
          metrics.drawProbabilityMass === 0 &&
          metrics.conditionalExpectedBestShanten === null,
      ),
    ).toBe(true);
  });
});
