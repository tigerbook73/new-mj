import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCTION_SELECTION } from "./canonical-fixtures.ts";
import { createJunkFixtureProvider } from "./fixture-provider.ts";
import { formatCalibrationSummary, serializeCalibrationReport } from "./report.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";
import { runSingleCalibrationScenario } from "./runner.ts";
import { CALIBRATION_SCHEMA_VERSION, type CalibrationManifest, type CalibrationRun } from "./types.ts";

const fixture = CANONICAL_PRODUCTION_SELECTION;

const manifest: CalibrationManifest = {
  schemaVersion: CALIBRATION_SCHEMA_VERSION,
  id: "junk-structural-calibration-canonical",
  version: 1,
  scenarios: [fixture.scenario],
};

const run: CalibrationRun = {
  runId: "run-single-001",
  gitSha: "working-tree",
  command: "pnpm --filter @new-mj/ai evaluate --scenario canonical-production-selection-001",
  configHash: "config-single-001",
  startedAt: "2026-08-10T00:00:00.000Z",
  workerCount: 1,
};

describe("single calibration runner", () => {
  it("resolves, evaluates and reports one real fixture", () => {
    const provider = createJunkFixtureProvider([fixture]);
    const report = runSingleCalibrationScenario(
      manifest,
      fixture.scenario.id,
      provider,
      (normalized) => evaluateProductionFixture(normalized.scenario.id, normalized.input),
      run,
    );

    expect(report.evaluations).toHaveLength(1);
    expect(report.evaluations[0]?.scenarioId).toBe(fixture.scenario.id);
    expect(report.evaluations[0]?.status).toBe("ok");
    expect(fixture.input.legalActions).toContainEqual(report.evaluations[0]?.candidates[0]?.action);
    expect(serializeCalibrationReport(report)).toContain('"schemaVersion": 1');
    expect(formatCalibrationSummary(report)).toContain("canonical-production-selection-001");
  });

  it("fails before provider execution when the scenario is absent", () => {
    const provider = createJunkFixtureProvider([fixture]);
    expect(() =>
      runSingleCalibrationScenario(manifest, "missing", provider, () => {
        throw new Error("must not run");
      }, run),
    ).toThrow("SCENARIO_NOT_FOUND: missing");
  });
});
