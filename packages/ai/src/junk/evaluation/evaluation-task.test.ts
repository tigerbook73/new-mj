import { describe, expect, it } from "vitest";
import { CANONICAL_JUNK_SCENARIO_PROVIDER, JUNK_CALIBRATION_MANIFEST } from "./canonical-fixtures.ts";
import { evaluateJunkTask } from "./evaluation-task.ts";

describe("Junk evaluation worker task", () => {
  it("routes structural-claim for a normalized claim snapshot", () => {
    const scenario = JUNK_CALIBRATION_MANIFEST.scenarios.find(
      ({ id }) => id === "claim-peng-reaches-tenpai-001",
    )!;
    const normalized = CANONICAL_JUNK_SCENARIO_PROVIDER.resolve(scenario);
    const result = evaluateJunkTask({
      scenarioId: scenario.id,
      input: normalized.input,
      contentHash: normalized.contentHash,
      evaluator: "structural-claim",
    });

    expect(result.evaluator).toBe("structural-claim");
    expect(result.selectedCandidateId).toBe(JSON.stringify({ type: "peng" }));
  });
});
