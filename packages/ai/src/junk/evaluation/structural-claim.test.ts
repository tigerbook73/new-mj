import { describe, expect, it } from "vitest";
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  JUNK_CALIBRATION_MANIFEST,
} from "./canonical-fixtures.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";
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
    const production = evaluateProductionFixture(scenarioId, normalized.input);

    expect(structural).toMatchObject({
      evaluator: "structural-claim",
      evaluatorVersion: "v1",
      status: "ok",
    });
    expect(JSON.parse(structural.selectedCandidateId!).type).toBe(expectedType);
    expect(JSON.parse(production.selectedCandidateId!).type).toBe(expectedType);
    expect(structural.candidates).toHaveLength(2);
  });
});
