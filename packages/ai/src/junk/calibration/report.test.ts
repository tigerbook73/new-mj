import { describe, expect, it } from "vitest";
import {
  createCalibrationReport,
  formatCalibrationSummary,
  serializeCalibrationReport,
} from "./report.ts";
import { CALIBRATION_SCHEMA_VERSION, type CalibrationManifest, type CalibrationRun } from "./types.ts";

const manifest: CalibrationManifest = {
  schemaVersion: CALIBRATION_SCHEMA_VERSION,
  id: "structural-smoke",
  version: 1,
  scenarios: [],
};

const run: CalibrationRun = {
  runId: "run-001",
  gitSha: "abc1234",
  command: "calibrate:junk --manifest structural-smoke",
  configHash: "config-001",
  startedAt: "2026-08-10T00:00:00.000Z",
  workerCount: 1,
};

describe("calibration report contract", () => {
  it("sorts evaluations independently of worker completion order", () => {
    const report = createCalibrationReport(run, manifest, [
      {
        scenarioId: "scenario-b",
        evaluator: "two-ply",
        evaluatorVersion: "v1",
        candidates: [],
        performance: { durationMs: 3, cacheHits: 0, cacheMisses: 0 },
        status: "ok",
      },
      {
        scenarioId: "scenario-a",
        evaluator: "standard-only",
        evaluatorVersion: "v1",
        candidates: [],
        performance: { durationMs: 2, cacheHits: 0, cacheMisses: 0 },
        status: "ok",
      },
    ]);

    expect(report.evaluations.map((evaluation) => evaluation.scenarioId)).toEqual([
      "scenario-a",
      "scenario-b",
    ]);
    expect(serializeCalibrationReport(report)).toBe(serializeCalibrationReport(report));
  });

  it("keeps the human summary fixed and useful for a first run", () => {
    const report = createCalibrationReport(run, manifest, [
      {
        scenarioId: "scenario-a",
        evaluator: "standard-only",
        evaluatorVersion: "v1",
        selectedCandidateId: "discard-3m",
        candidates: [],
        performance: { durationMs: 2, cacheHits: 4, cacheMisses: 1 },
        status: "ok",
      },
    ]);

    expect(formatCalibrationSummary(report)).toContain(
      "scenario-a / standard-only@v1: ok, selected=discard-3m, 2ms",
    );
    expect(formatCalibrationSummary(report)).toContain("evaluations: 1 (ok=1, failed=0, skipped=0)");
  });
});
