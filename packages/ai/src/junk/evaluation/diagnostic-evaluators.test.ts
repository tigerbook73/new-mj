import { describe, expect, it } from "vitest";
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  JUNK_CALIBRATION_MANIFEST,
} from "./canonical-fixtures.ts";
import { evaluateOnePlyAll, evaluateTwoPlyAll } from "./diagnostic-evaluators.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";
import { runSingleCalibrationScenarioEvaluators } from "../../evaluation/runner.ts";

describe("Junk diagnostic evaluators", () => {
  it.each(["discard-001", "discard-snapshot-001"])(
    "reports three comparable routes for %s",
    (scenarioId) => {
      const report = runSingleCalibrationScenarioEvaluators(
        JUNK_CALIBRATION_MANIFEST,
        scenarioId,
        CANONICAL_JUNK_SCENARIO_PROVIDER,
        [
          ({ scenario, input }) => evaluateProductionFixture(scenario.id, input),
          ({ scenario, input }) => evaluateOnePlyAll(scenario.id, input),
          ({ scenario, input }) => evaluateTwoPlyAll(scenario.id, input),
        ],
        {
          runId: "three-routes",
          gitSha: "working-tree",
          command: `evaluate run ${scenarioId}`,
          configHash: "canonical-baseline@1",
          startedAt: "2026-08-10T00:00:00.000Z",
          workerCount: 1,
        },
      );
      expect(report.evaluations.map(({ evaluator }) => evaluator).sort()).toEqual([
        "one-ply-all",
        "production-weighted",
        "two-ply-all",
      ]);
      expect(report.evaluations.every(({ scenarioContentHash }) =>
        scenarioContentHash === report.evaluations[0]?.scenarioContentHash)).toBe(true);
      expect(report.evaluations.every(({ status }) => status === "ok")).toBe(true);
      expect(report.evaluations.find(({ evaluator }) => evaluator === "one-ply-all")?.candidates)
        .toHaveLength(14);
      expect(report.evaluations.find(({ evaluator }) => evaluator === "two-ply-all")?.candidates)
        .toHaveLength(14);
    },
  );
});
