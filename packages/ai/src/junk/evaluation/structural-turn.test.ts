import { describe, expect, it } from "vitest";
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  JUNK_CALIBRATION_MANIFEST,
} from "./canonical-fixtures.ts";
import { evaluateStructuralTurnPolicy } from "./structural-turn.ts";

describe("structural-turn evaluator", () => {
  it("keeps both self-turn gangs diagnostic when they tie equivalent discards", () => {
    const scenario = JUNK_CALIBRATION_MANIFEST.scenarios.find(
      ({ id }) => id === "self-gang-equivalence-001",
    )!;
    const normalized = CANONICAL_JUNK_SCENARIO_PROVIDER.resolve(scenario);
    const structural = evaluateStructuralTurnPolicy(scenario.id, normalized.input);

    expect(JSON.parse(structural.selectedCandidateId!).type).toBe("discard");
    expect(
      structural.candidates
        .filter(({ candidateId }) => /anGang|buGang/.test(candidateId))
        .map(({ metrics }) => metrics.supported),
    ).toEqual([true, true]);
  });
});
