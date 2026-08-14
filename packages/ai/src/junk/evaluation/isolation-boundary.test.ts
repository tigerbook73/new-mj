import { describe, expect, it } from "vitest";
import { CANONICAL_JUNK_SNAPSHOT } from "./canonical-fixtures.ts";
import { evaluateIsolationBoundary } from "./isolation-boundary.ts";

describe("isolationPotential boundary diagnostics", () => {
  it("reports a paired two-ply rank reversal only inside a structurally equivalent group", () => {
    const result = evaluateIsolationBoundary(
      CANONICAL_JUNK_SNAPSHOT.scenario.id,
      CANONICAL_JUNK_SNAPSHOT.input,
    );
    const eligible = result.candidates.filter(
      ({ metrics }) => metrics.structurallyEquivalent === true,
    );

    expect(result).toMatchObject({
      evaluator: "isolation-boundary",
      evaluatorVersion: "v1",
      status: "ok",
    });
    expect(result.selectedCandidateId).toBeUndefined();
    expect(result.candidates).toHaveLength(14);
    expect(eligible).toHaveLength(2);
    expect(eligible.map(({ metrics }) => metrics.twoPlyRankWithIsolation)).toEqual([1, 2]);
    expect(eligible.map(({ metrics }) => metrics.twoPlyRankWithoutIsolation)).toEqual([2, 1]);
    expect(
      eligible.every(
        ({ metrics }) =>
          Number(metrics.twoPlyIsolationDelta) >= 0 &&
          Array.isArray(metrics.equivalentCandidateIds) &&
          metrics.equivalentCandidateIds.length === 2,
      ),
    ).toBe(true);
  });

  it("does not assign ranks across candidates with different structural metrics", () => {
    const result = evaluateIsolationBoundary(
      CANONICAL_JUNK_SNAPSHOT.scenario.id,
      CANONICAL_JUNK_SNAPSHOT.input,
    );
    const ineligible = result.candidates.filter(
      ({ metrics }) => metrics.structurallyEquivalent === false,
    );
    expect(ineligible.length).toBeGreaterThan(0);
    expect(
      ineligible.every(
        ({ metrics }) =>
          Array.isArray(metrics.equivalentCandidateIds) &&
          metrics.equivalentCandidateIds.length === 0 &&
          metrics.onePlyRankWithIsolation === null &&
          metrics.twoPlyRankWithoutIsolation === null,
      ),
    ).toBe(true);
  });
});
