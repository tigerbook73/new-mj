import { describe, expect, it } from "vitest";
import {
  structuralGateAcceptance,
  validatePairedStructuralCandidate,
} from "./paired-validation.ts";

describe("paired structural validation", () => {
  it("uses disjoint generated splits and reports paired baseline/candidate counts", () => {
    const result = validatePairedStructuralCandidate({
      developmentSeed: 101,
      heldOutSeed: 202,
      count: 1,
    });
    expect(result).toMatchObject({
      protocolVersion: "paired-standard-heldout-v1",
      generatorVersion: "standard-concealed-v1",
      candidate: { isolationPotential: 0 },
      splitDisjoint: true,
      development: { seed: 101, scenarioCount: 1 },
      heldOut: { seed: 202, scenarioCount: 1 },
    });
    expect(typeof result.accepted).toBe("boolean");
    expect(Array.isArray(result.development.decisionDifferenceScenarioSeeds)).toBe(true);
  });

  it("rejects identical top-level seeds before evaluating a held-out split", () => {
    expect(() =>
      validatePairedStructuralCandidate({
        developmentSeed: 101,
        heldOutSeed: 101,
        count: 1,
      }),
    ).toThrow("OVERLAPPING_VALIDATION_SEEDS");
  });

  it("rejects a candidate when either split gains a dominated selection", () => {
    expect(
      structuralGateAcceptance(
        { baselineDominatedSelectionCount: 1, candidateDominatedSelectionCount: 2 },
        { baselineDominatedSelectionCount: 3, candidateDominatedSelectionCount: 3 },
      ),
    ).toEqual({
      developmentDominatedSelectionsDidNotIncrease: false,
      heldOutDominatedSelectionsDidNotIncrease: true,
    });
  });
});
