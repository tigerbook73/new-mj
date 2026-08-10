import { describe, expect, it } from "vitest";
import baseline from "../src/junk/evaluation/fixtures/baselines/discard-001.production-weighted.v1.baseline.json" with { type: "json" };
import { compareCalibrationBaseline, type CalibrationBaseline } from "../src/evaluation/comparator.ts";
import { executeCalibrationTasks, executeCalibrationTasksInWorkers } from "../src/evaluation/executor.ts";
import { runCalibrationEvaluationsWithExecutor, runSingleCalibrationScenario } from "../src/evaluation/runner.ts";
import { CANONICAL_PRODUCTION_SELECTION, JUNK_CALIBRATION_MANIFEST } from "../src/junk/evaluation/canonical-fixtures.ts";
import { createJunkFixtureProvider } from "../src/junk/evaluation/fixture-provider.ts";
import { evaluateProductionFixture } from "../src/junk/evaluation/production-evaluator.ts";
import { evaluateProductionTask } from "../src/junk/evaluation/production-evaluator-task.ts";

const fixture = CANONICAL_PRODUCTION_SELECTION;
const run = {
  runId: "junk-runner-test", gitSha: "working-tree", command: "test",
  configHash: "canonical-baseline@1", startedAt: "2026-08-10T00:00:00.000Z", workerCount: 1,
};

describe("Junk evaluation runner integration", () => {
  it("runs a real fixture and matches its production baseline", () => {
    const report = runSingleCalibrationScenario(
      JUNK_CALIBRATION_MANIFEST,
      fixture.scenario.id,
      createJunkFixtureProvider([fixture]),
      (normalized) => evaluateProductionFixture(normalized.scenario.id, normalized.input),
      run,
    );
    expect(compareCalibrationBaseline(
      baseline as CalibrationBaseline,
      report.evaluations[0]!,
    ).status).toBe("matched");
    expect(fixture.input.legalActions).toContainEqual(report.evaluations[0]?.candidates[0]?.action);
  });

  it("produces equivalent results through sequential and worker executors", async () => {
    const normalized = {
      scenario: fixture.scenario,
      input: fixture.input,
      contentHash: fixture.contentHash!,
    };
    const sequential = await runCalibrationEvaluationsWithExecutor(
      JUNK_CALIBRATION_MANIFEST,
      [normalized],
      (tasks) => executeCalibrationTasks(tasks, evaluateProductionTask),
      run,
    );
    const worker = await runCalibrationEvaluationsWithExecutor(
      JUNK_CALIBRATION_MANIFEST,
      [normalized],
      (tasks) => executeCalibrationTasksInWorkers(tasks, {
        workerCount: 1,
        workerUrl: new URL("../src/evaluation/worker.ts", import.meta.url),
        moduleUrl: new URL("../src/junk/evaluation/production-evaluator-task.ts", import.meta.url),
        exportName: "evaluateProductionTask",
      }),
      run,
    );
    expect(worker.evaluations[0]?.selectedCandidateId).toBe(
      sequential.evaluations[0]?.selectedCandidateId,
    );
    expect(worker.evaluations[0]?.scenarioContentHash).toBe(
      sequential.evaluations[0]?.scenarioContentHash,
    );
  });
});
