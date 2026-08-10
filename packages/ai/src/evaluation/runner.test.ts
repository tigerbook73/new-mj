import { describe, expect, it } from "vitest";
import { executeCalibrationTasks } from "./executor.ts";
import { parseCalibrationJsonl } from "./jsonl.ts";
import {
  runCalibrationJsonlBatch,
  runCalibrationJsonlBatchWithExecutor,
  runSingleCalibrationScenario,
} from "./runner.ts";
import { CALIBRATION_SCHEMA_VERSION, type CalibrationManifest, type CalibrationRun } from "./types.ts";

const scenario = {
  id: "scenario-a",
  version: 1,
  source: { kind: "fixture" as const, fixtureId: "fixture-a" },
};
const manifest: CalibrationManifest = {
  schemaVersion: CALIBRATION_SCHEMA_VERSION,
  id: "runner-test",
  version: 1,
  scenarios: [scenario],
};
const run: CalibrationRun = {
  runId: "run-001", gitSha: "working-tree", command: "test", configHash: "config",
  startedAt: "2026-08-10T00:00:00.000Z", workerCount: 1,
};
const records = <T>(text: string) => (async function* () {
  for (const record of parseCalibrationJsonl<T>(text)) yield record;
})();
const header =
  '{"type":"header","schemaVersion":1,"manifestId":"runner-test","manifestVersion":1,"shardId":"part-0000","shardIndex":0}\n';

describe("single calibration runner", () => {
  it("resolves, evaluates and hashes one scenario", () => {
    const report = runSingleCalibrationScenario(
      manifest,
      scenario.id,
      { resolve: (resolved) => ({ scenario: resolved, input: { value: 1 }, contentHash: "hash-a" }) },
      (normalized) => ({
        scenarioId: normalized.scenario.id,
        evaluator: "standard-only",
        evaluatorVersion: "test",
        selectedCandidateId: String(normalized.input.value),
        candidates: [],
        performance: { durationMs: 0, cacheHits: 0, cacheMisses: 0 },
        status: "ok",
      }),
      run,
    );
    expect(report.evaluations[0]).toMatchObject({
      scenarioId: "scenario-a", scenarioContentHash: "hash-a", selectedCandidateId: "1",
    });
  });

  it("fails before provider execution when the scenario is absent", () => {
    expect(() => runSingleCalibrationScenario(manifest, "missing", {
      resolve: () => { throw new Error("must not run"); },
    }, () => { throw new Error("must not run"); }, run)).toThrow("SCENARIO_NOT_FOUND: missing");
  });
});

describe("calibration JSONL batch runner", () => {
  it("streams records, preserves failures and returns stable scenario order", async () => {
    const scenarios = ["scenario-b", "scenario-a"].map((id) => ({ ...scenario, id }));
    const report = await runCalibrationJsonlBatch(
      { ...manifest, scenarios },
      records<{ value: number }>(header +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-b","data":{"value":2}}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-a","data":{"value":1}}'),
      (resolved, data) => ({ scenario: resolved, input: data, contentHash: `hash-${resolved.id}` }),
      (normalized) => {
        if (normalized.scenario.id === "scenario-b") throw new Error("synthetic failure");
        return {
          scenarioId: normalized.scenario.id,
          evaluator: "standard-only",
          evaluatorVersion: "test",
          selectedCandidateId: String(normalized.input.value),
          candidates: [],
          performance: { durationMs: 0, cacheHits: 0, cacheMisses: 0 },
          status: "ok",
        };
      },
      run,
    );
    expect(report.evaluations.map(({ scenarioId }) => scenarioId)).toEqual(["scenario-a", "scenario-b"]);
    expect(report.evaluations.map(({ status }) => status)).toEqual(["ok", "failed"]);
    expect(report.batch?.statusCounts).toEqual({ ok: 1, failed: 1, skipped: 0 });
    expect(report.batch?.failures[0]?.message).toBe("synthetic failure");
  });

  it("executes chunks and safely resumes matching evaluations", async () => {
    const scenarios = ["scenario-c", "scenario-a", "scenario-b"].map((id) => ({ ...scenario, id }));
    const chunkSizes: number[] = [];
    const checkpoints: string[][] = [];
    const report = await runCalibrationJsonlBatchWithExecutor(
      { ...manifest, scenarios },
      records<{ value: number }>(header +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-c","data":{"value":3}}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-a","data":{"value":1}}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-b","data":{"value":2}}'),
      (resolved, data) => ({ scenario: resolved, input: data, contentHash: `hash-${resolved.id}` }),
      async (tasks) => {
        chunkSizes.push(tasks.length);
        return executeCalibrationTasks(tasks, (task) => ({
          scenarioId: task.scenarioId,
          evaluator: "standard-only",
          evaluatorVersion: "v1",
          selectedCandidateId: String(task.input.value),
          candidates: [],
          performance: { durationMs: 1, cacheHits: 0, cacheMisses: 0 },
          status: "ok",
        }));
      },
      run,
      {
        chunkSize: 1,
        resumeEvaluations: [{
          scenarioId: "scenario-b", scenarioContentHash: "hash-scenario-b",
          evaluator: "standard-only", evaluatorVersion: "v1", selectedCandidateId: "2",
          candidates: [], performance: { durationMs: 1, cacheHits: 0, cacheMisses: 0 }, status: "ok",
        }],
        onCheckpoint: ({ evaluations }) => {
          checkpoints.push(evaluations.map(({ scenarioId }) => scenarioId));
        },
      },
    );
    expect(chunkSizes).toEqual([1, 1]);
    expect(checkpoints).toEqual([["scenario-c"], ["scenario-a"]]);
    expect(report.evaluations.map(({ scenarioId }) => scenarioId)).toEqual([
      "scenario-a", "scenario-b", "scenario-c",
    ]);
  });

  it("rejects stale resume data when the content hash changed", async () => {
    await expect(runCalibrationJsonlBatchWithExecutor(
      manifest,
      records<Record<string, never>>(header +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-a","data":{}}'),
      (resolved) => ({ scenario: resolved, input: {}, contentHash: "new-hash" }),
      () => Promise.resolve([]),
      run,
      { resumeEvaluations: [{
        scenarioId: "scenario-a", scenarioContentHash: "old-hash",
        evaluator: "standard-only", evaluatorVersion: "v1", candidates: [],
        performance: { durationMs: 0, cacheHits: 0, cacheMisses: 0 }, status: "ok",
      }] },
    )).rejects.toThrow("RESUME_CONTENT_HASH_MISMATCH: scenario-a");
  });
});
