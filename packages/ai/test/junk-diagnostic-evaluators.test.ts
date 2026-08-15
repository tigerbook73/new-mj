import { describe, expect, it } from "vitest";
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  JUNK_CALIBRATION_MANIFEST,
} from "../src/junk/evaluation/canonical-fixtures.ts";
import {
  evaluateOnePlyAll,
  evaluateTwoPlyAll,
} from "../src/junk/evaluation/diagnostic-evaluators.ts";
import { evaluateProductionFixture } from "../src/junk/evaluation/production-evaluator.ts";
import { evaluateStructuralMetrics } from "../src/junk/evaluation/structural-metrics.ts";
import { evaluateStructuralTwoPlyAll } from "../src/junk/evaluation/structural-two-ply.ts";
import { evaluateIsolationBoundary } from "../src/junk/evaluation/isolation-boundary.ts";
import { evaluateStructuralBounded } from "../src/junk/evaluation/structural-bounded.ts";
import { evaluateStructuralClaimPolicy } from "../src/junk/evaluation/structural-claim.ts";
import { runSingleCalibrationScenarioEvaluators } from "../src/evaluation/runner.ts";

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
          ({ scenario, input }) => evaluateStructuralMetrics(scenario.id, input),
          ({ scenario, input }) => evaluateOnePlyAll(scenario.id, input),
          ({ scenario, input }) => evaluateTwoPlyAll(scenario.id, input),
          ({ scenario, input }) => evaluateStructuralTwoPlyAll(scenario.id, input),
          ({ scenario, input }) => evaluateStructuralBounded(scenario.id, input),
          ({ scenario, input }) => evaluateStructuralClaimPolicy(scenario.id, input),
          ({ scenario, input }) => evaluateIsolationBoundary(scenario.id, input),
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
        "isolation-boundary",
        "one-ply-all",
        "production-weighted",
        "standard-only",
        "structural-bounded",
        "structural-claim",
        "two-ply-all",
        "two-ply-structural-all",
      ]);
      expect(
        report.evaluations.every(
          ({ scenarioContentHash }) =>
            scenarioContentHash === report.evaluations[0]?.scenarioContentHash,
        ),
      ).toBe(true);
      expect(report.evaluations.every(({ status }) => status === "ok")).toBe(true);
      expect(
        report.evaluations.find(({ evaluator }) => evaluator === "one-ply-all")?.candidates,
      ).toHaveLength(14);
      expect(
        report.evaluations.find(({ evaluator }) => evaluator === "two-ply-all")?.candidates,
      ).toHaveLength(14);
      expect(
        report.evaluations.find(({ evaluator }) => evaluator === "standard-only")?.candidates,
      ).toHaveLength(14);
      const structuralTwoPly = report.evaluations.find(
        ({ evaluator }) => evaluator === "two-ply-structural-all",
      );
      expect(structuralTwoPly?.candidates).toHaveLength(14);
      expect(structuralTwoPly?.selectedCandidateId).toBeUndefined();
      const structuralBounded = report.evaluations.find(
        ({ evaluator }) => evaluator === "structural-bounded",
      );
      expect(structuralBounded?.candidates).toHaveLength(14);
      expect(structuralBounded?.selectedCandidateId).toBeDefined();
      const searchedCount =
        structuralBounded?.candidates.filter(({ metrics }) => metrics.searched).length ?? 0;
      expect(searchedCount).toBeGreaterThan(0);
      expect(searchedCount).toBeLessThanOrEqual(5);
      expect(
        report.evaluations.find(({ evaluator }) => evaluator === "two-ply-all")
          ?.selectedCandidateId,
      ).toBeDefined();
      expect(
        report.evaluations.find(({ evaluator }) => evaluator === "production-weighted")
          ?.selectedCandidateId,
      ).toBeDefined();
      expect(
        report.evaluations.find(({ evaluator }) => evaluator === "isolation-boundary")
          ?.selectedCandidateId,
      ).toBeUndefined();
    },
  );
});
