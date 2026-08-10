import { describe, expect, it } from "vitest";
import { compareCalibrationBaseline } from "../../evaluation/comparator.ts";
import { runSingleCalibrationScenarioEvaluators } from "../../evaluation/runner.ts";
import { CANONICAL_JUNK_SCENARIO_PROVIDER, JUNK_CALIBRATION_MANIFEST } from "./canonical-fixtures.ts";
import { JUNK_EVALUATION_BASELINES } from "./baselines.ts";
import { evaluateOnePlyAll, evaluateTwoPlyAll } from "./diagnostic-evaluators.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";

describe("versioned Junk evaluation baselines", () => {
  it.each(["discard-001", "discard-snapshot-001"])("matches all three routes for %s", (scenarioId) => {
    const report = runSingleCalibrationScenarioEvaluators(
      JUNK_CALIBRATION_MANIFEST,
      scenarioId,
      CANONICAL_JUNK_SCENARIO_PROVIDER,
      [
        ({ scenario, input }) => evaluateProductionFixture(scenario.id, input),
        ({ scenario, input }) => evaluateOnePlyAll(scenario.id, input),
        ({ scenario, input }) => evaluateTwoPlyAll(scenario.id, input),
      ],
      { runId: "baseline-test", gitSha: "working-tree", command: "test", configHash: "canonical-baseline@1", startedAt: "2026-08-10T00:00:00.000Z", workerCount: 1 },
    );
    const baselines = JUNK_EVALUATION_BASELINES.filter((baseline) => baseline.scenarioId === scenarioId);
    expect(baselines).toHaveLength(3);
    expect(baselines.map((baseline) => compareCalibrationBaseline(
      baseline,
      report.evaluations.find(({ evaluator }) => evaluator === baseline.evaluator)!,
    ).status)).toEqual(["matched", "matched", "matched"]);
  });
});
