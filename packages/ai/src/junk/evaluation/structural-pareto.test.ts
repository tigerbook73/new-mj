import { describe, expect, it } from "vitest";
import {
  annotateStructuralPareto,
  compareStructuralPareto,
  type StructuralParetoInput,
} from "./structural-pareto.ts";

const candidate = (
  candidateId: string,
  standardShanten: number,
  liveImprovingKindCount: number,
  liveImprovingTileCount: number,
): StructuralParetoInput => ({
  candidateId,
  standardShanten,
  liveImprovingKindCount,
  liveImprovingTileCount,
});

describe("structural Pareto diagnostics", () => {
  it("distinguishes strict dominance, ties, conflicts, and shanten boundaries", () => {
    const strong = candidate("strong", 2, 8, 24);
    expect(compareStructuralPareto(strong, candidate("weaker", 2, 6, 20))).toBe("dominates");
    expect(compareStructuralPareto(strong, candidate("same", 2, 8, 24))).toBe("tied");
    expect(compareStructuralPareto(strong, candidate("width-conflict", 2, 6, 28))).toBe(
      "incomparable",
    );
    expect(compareStructuralPareto(strong, candidate("other-shanten", 3, 1, 1))).toBe(
      "incomparable",
    );
  });

  it("marks a stable multi-candidate frontier without selecting an action", () => {
    const annotations = annotateStructuralPareto([
      candidate("dominated", 1, 3, 9),
      candidate("frontier-a", 1, 4, 12),
      candidate("frontier-b", 1, 5, 10),
      candidate("tie-a", 2, 2, 6),
      candidate("tie-b", 2, 2, 6),
    ]);
    expect(annotations.get("dominated")).toMatchObject({
      sameShantenParetoFrontier: false,
      dominatedByCandidateIds: ["frontier-a", "frontier-b"],
    });
    expect(annotations.get("frontier-a")).toMatchObject({
      sameShantenParetoFrontier: true,
      dominatesCandidateIds: ["dominated"],
      incomparableCandidateIds: ["frontier-b", "tie-a", "tie-b"],
    });
    expect(annotations.get("tie-a")?.tiedCandidateIds).toEqual(["tie-b"]);
  });

  it("rejects duplicate candidate IDs", () => {
    expect(() =>
      annotateStructuralPareto([candidate("same", 1, 1, 1), candidate("same", 1, 2, 2)]),
    ).toThrow("DUPLICATE_PARETO_CANDIDATE_ID");
  });
});
