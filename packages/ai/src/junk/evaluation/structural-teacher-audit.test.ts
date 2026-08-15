import { describe, expect, it } from "vitest";
import { auditStructuralTeacher } from "./structural-teacher-audit.ts";

describe("bounded/full structural teacher audit", () => {
  it("pairs disjoint deterministic splits and reports latency and agreement", () => {
    const result = auditStructuralTeacher({ developmentSeed: 101, heldOutSeed: 202, count: 2 });

    expect(result).toMatchObject({
      protocolVersion: "bounded-structural-teacher-v1",
      generatorVersion: "standard-concealed-v1",
      splitDisjoint: true,
      thresholds: { minimumAgreementRate: 0.99, maximumP95Ratio: 0.6 },
    });
    for (const split of [result.development, result.heldOut]) {
      expect(split.scenarioCount).toBe(2);
      expect(split.agreementCount + split.mismatchCount).toBe(2);
      expect(split.averageBoundedSearchedCandidateCount).toBeLessThanOrEqual(5);
      expect(split.boundedLatency.p95Ms).toBeGreaterThan(0);
      expect(split.fullLatency.p95Ms).toBeGreaterThan(0);
    }
  });

  it("rejects overlapping top-level seeds", () => {
    expect(() =>
      auditStructuralTeacher({ developmentSeed: 101, heldOutSeed: 101, count: 1 }),
    ).toThrow("OVERLAPPING_AUDIT_SEEDS");
  });
});
