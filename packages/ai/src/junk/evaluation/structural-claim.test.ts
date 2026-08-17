import { describe, expect, it } from "vitest";
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  JUNK_CALIBRATION_MANIFEST,
} from "./canonical-fixtures.ts";
import { evaluateStructuralClaimPolicy } from "./structural-claim.ts";

describe("structural-claim evaluator", () => {
  it.each([
    ["claim-chi-breaks-tenpai-001", "pass"],
    ["claim-peng-reaches-tenpai-001", "peng"],
    ["claim-chi-tied-pass-001", "pass"],
  ])("matches the canonical claim boundary for %s", (scenarioId, expectedType) => {
    const scenario = JUNK_CALIBRATION_MANIFEST.scenarios.find(({ id }) => id === scenarioId)!;
    const normalized = CANONICAL_JUNK_SCENARIO_PROVIDER.resolve(scenario);
    const structural = evaluateStructuralClaimPolicy(scenarioId, normalized.input);

    expect(structural).toMatchObject({
      evaluator: "structural-claim",
      evaluatorVersion: "v1",
      status: "ok",
    });
    expect(JSON.parse(structural.selectedCandidateId!).type).toBe(expectedType);
    expect(structural.candidates).toHaveLength(2);
  });

  it("reports the canonical minGang replacement-draw search", () => {
    const scenario = JUNK_CALIBRATION_MANIFEST.scenarios.find(
      ({ id }) => id === "claim-mingang-replacement-001",
    )!;
    const normalized = CANONICAL_JUNK_SCENARIO_PROVIDER.resolve(scenario);
    const structural = evaluateStructuralClaimPolicy(scenario.id, normalized.input);
    const minGang = structural.candidates.find(
      ({ candidateId }) => JSON.parse(candidateId).type === "minGang",
    )!;

    expect(JSON.parse(structural.selectedCandidateId!).type).toBe("minGang");
    expect(minGang.metrics).toMatchObject({ supported: true, drawKindCount: 33 });
    expect(minGang.metrics.immediateCompletionMass).toBeGreaterThan(0);
  });
});
