import { STANDARD_TILE_SET } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCTION_SELECTION } from "./canonical-fixtures.ts";
import { evaluateStructuralBounded } from "./structural-bounded.ts";

describe("structural-bounded evaluator", () => {
  it("adapts the shadow policy without hiding truncated candidates", () => {
    const result = evaluateStructuralBounded(
      CANONICAL_PRODUCTION_SELECTION.scenario.id,
      CANONICAL_PRODUCTION_SELECTION.input,
    );

    expect(result).toMatchObject({
      evaluator: "structural-bounded",
      evaluatorVersion: "v1",
      status: "ok",
    });
    expect(result.candidates).toHaveLength(14);
    expect(result.candidates.filter(({ metrics }) => metrics.searched)).toHaveLength(5);
    expect(result.candidates.some(({ metrics }) => metrics.dominated)).toBe(true);
    const selected = result.candidates.find(
      ({ candidateId }) => candidateId === result.selectedCandidateId,
    );
    const expected = CANONICAL_PRODUCTION_SELECTION.input.legalActions.find(
      (action) => action.type === "discard" && STANDARD_TILE_SET.kindOf(action.tile) === "5p",
    );
    expect(result.selectedCandidateId).toBe(JSON.stringify(expected));
    expect(selected?.metrics).not.toHaveProperty("score");
  });
});
