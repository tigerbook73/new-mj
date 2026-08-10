import { describe, expect, it } from "vitest";
import baseline from "./fixtures/baselines/discard-001-production-v1.baseline.json" with { type: "json" };
import { CANONICAL_PRODUCTION_SELECTION } from "./canonical-fixtures.ts";
import { createJunkFixtureProvider } from "./fixture-provider.ts";
import { formatCalibrationSummary, serializeCalibrationReport } from "../../evaluation/report.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";
import {
  runSingleCalibrationScenario,
  runCalibrationJsonlBatch,
  runCalibrationJsonlBatchWithExecutor,
} from "../../evaluation/runner.ts";
import { executeCalibrationTasks, executeCalibrationTasksInWorkers } from "../../evaluation/executor.ts";
import { evaluateProductionTask } from "./production-evaluator-task.ts";
import { parseCalibrationJsonl } from "../../evaluation/jsonl.ts";
import { CALIBRATION_SCHEMA_VERSION, type CalibrationManifest, type CalibrationRun } from "../../evaluation/types.ts";

const fixture = CANONICAL_PRODUCTION_SELECTION;

const manifest: CalibrationManifest = {
  schemaVersion: CALIBRATION_SCHEMA_VERSION,
  id: "canonical-baseline",
  version: 1,
  scenarios: [fixture.scenario],
};

const run: CalibrationRun = {
  runId: "run-single-001",
  gitSha: "working-tree",
  command: "pnpm --filter @new-mj/ai evaluate run discard-001",
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
    expect(report.evaluations[0]?.scenarioContentHash).toBeDefined();
    expect(report.evaluations[0]?.scenarioContentHash).toBe(baseline.scenarioContentHash);
    expect(report.evaluations[0]?.selectedCandidateId).toBe(
      JSON.stringify(baseline.expected.selectedAction),
    );
    expect(report.evaluations[0]?.candidates[0]?.metrics.legalActionCount).toBe(
      baseline.expected.legalActionCount,
    );
    expect(fixture.input.legalActions).toContainEqual(report.evaluations[0]?.candidates[0]?.action);
    expect(serializeCalibrationReport(report)).toContain('"schemaVersion": 1');
    expect(formatCalibrationSummary(report)).toContain("discard-001");
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

describe("JSONL batch runner", () => {
  it("streams records and returns stable scenario order", async () => {
    const scenarios = [
      { ...fixture.scenario, id: "scenario-b" },
      { ...fixture.scenario, id: "scenario-a" },
    ];
    const batchManifest: CalibrationManifest = { ...manifest, scenarios };
    const records = parseCalibrationJsonl<{ value: number }>(
      '{"type":"header","schemaVersion":1,"manifestId":"m","manifestVersion":1,"shardId":"part-0000","shardIndex":0}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-b","data":{"value":2}}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-a","data":{"value":1}}',
    );
    const asyncRecords = (async function* () {
      for (const record of records) yield record;
    })();
    const report = await runCalibrationJsonlBatch(
      batchManifest,
      asyncRecords,
      (scenario, data) => ({ scenario, input: data, contentHash: `hash-${scenario.id}` }),
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
    expect(report.evaluations.map(({ scenarioId }) => scenarioId)).toEqual([
      "scenario-a",
      "scenario-b",
    ]);
    expect(report.evaluations.map(({ scenarioContentHash }) => scenarioContentHash)).toEqual([
      "hash-scenario-a",
      "hash-scenario-b",
    ]);
    expect(report.batch?.scenarioCount).toBe(2);
    expect(report.batch?.statusCounts.ok).toBe(2);
    expect(report.batch?.latencyMs.p50).toBe(0);
    expect(report.batch?.failures).toEqual([]);
  });

  it("keeps an evaluator failure in the batch report", async () => {
    const records = parseCalibrationJsonl<{ value: number }>(
      '{"type":"header","schemaVersion":1,"manifestId":"m","manifestVersion":1,"shardId":"part-0000","shardIndex":0}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-a","data":{"value":1}}',
    );
    const report = await runCalibrationJsonlBatch(
      { ...manifest, scenarios: [{ ...fixture.scenario, id: "scenario-a" }] },
      (async function* () { for (const record of records) yield record; })(),
      (scenario, data) => ({ scenario, input: data, contentHash: "hash-a" }),
      () => { throw new Error("synthetic evaluator failure"); },
      run,
      { evaluatorKind: "production-weighted" },
    );
    expect(report.evaluations[0]?.status).toBe("failed");
    expect(report.batch?.failures).toEqual([
      { scenarioId: "scenario-a", message: "synthetic evaluator failure" },
    ]);
  });

  it("produces the same full report through sequential and worker executors", async () => {
    const recordsText =
      '{"type":"header","schemaVersion":1,"manifestId":"m","manifestVersion":1,"shardId":"part-0000","shardIndex":0}\n' +
      '{"type":"scenario","schemaVersion":1,"scenarioId":"discard-001","data":{}}';
    const parseRecords = () => parseCalibrationJsonl<Record<string, never>>(recordsText);
    const resolve = (scenario: typeof fixture.scenario) => ({
      scenario,
      input: fixture.input,
      contentHash: fixture.contentHash!,
    });
    const sequential = await runCalibrationJsonlBatchWithExecutor(
      { ...manifest, scenarios: [fixture.scenario] },
      (async function* () { for (const record of parseRecords()) yield record; })(),
      (scenario) => resolve(scenario),
      (tasks) => executeCalibrationTasks(tasks, (task) => evaluateProductionTask(task)),
      run,
    );
    const worker = await runCalibrationJsonlBatchWithExecutor(
      { ...manifest, scenarios: [fixture.scenario] },
      (async function* () { for (const record of parseRecords()) yield record; })(),
      (scenario) => resolve(scenario),
      (tasks) => executeCalibrationTasksInWorkers(tasks, {
        workerCount: 1,
        workerUrl: new URL("../../evaluation/worker.ts", import.meta.url),
        moduleUrl: new URL("./production-evaluator-task.ts", import.meta.url),
        exportName: "evaluateProductionTask",
      }),
      run,
    );
    expect(worker.evaluations[0]?.scenarioId).toBe(sequential.evaluations[0]?.scenarioId);
    expect(worker.evaluations[0]?.selectedCandidateId).toBe(
      sequential.evaluations[0]?.selectedCandidateId,
    );
    expect(worker.evaluations[0]?.scenarioContentHash).toBe(
      sequential.evaluations[0]?.scenarioContentHash,
    );
  });

  it("executes JSONL in chunks and safely resumes matching evaluations", async () => {
    const scenarios = ["scenario-c", "scenario-a", "scenario-b"].map((id) => ({
      ...fixture.scenario,
      id,
    }));
    const batchManifest: CalibrationManifest = { ...manifest, scenarios };
    const records = parseCalibrationJsonl<{ value: number }>(
      '{"type":"header","schemaVersion":1,"manifestId":"m","manifestVersion":1,"shardId":"part-0000","shardIndex":0}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-c","data":{"value":3}}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-a","data":{"value":1}}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"scenario-b","data":{"value":2}}',
    );
    const chunkSizes: number[] = [];
    const progress: Array<{ seen: number; executed: number; resumed: number }> = [];
    const checkpoints: string[][] = [];
    const report = await runCalibrationJsonlBatchWithExecutor(
      batchManifest,
      (async function* () { for (const record of records) yield record; })(),
      (scenario, data) => ({ scenario, input: data, contentHash: `hash-${scenario.id}` }),
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
          scenarioId: "scenario-b",
          scenarioContentHash: "hash-scenario-b",
          evaluator: "standard-only",
          evaluatorVersion: "v1",
          selectedCandidateId: "2",
          candidates: [],
          performance: { durationMs: 1, cacheHits: 0, cacheMisses: 0 },
          status: "ok",
        }],
        onProgress: ({ seen, executed, resumed }) => {
          progress.push({ seen, executed, resumed });
        },
        onCheckpoint: ({ evaluations }) => {
          checkpoints.push(evaluations.map(({ scenarioId }) => scenarioId));
        },
      },
    );
    expect(chunkSizes).toEqual([1, 1]);
    expect(checkpoints).toEqual([["scenario-c"], ["scenario-a"]]);
    expect(report.evaluations.map(({ scenarioId }) => scenarioId)).toEqual([
      "scenario-a",
      "scenario-b",
      "scenario-c",
    ]);
    expect(progress.at(-1)).toEqual({ seen: 3, executed: 2, resumed: 1 });
  });

  it("rejects stale resume data when the content hash changed", async () => {
    const records = parseCalibrationJsonl<Record<string, never>>(
      '{"type":"header","schemaVersion":1,"manifestId":"m","manifestVersion":1,"shardId":"part-0000","shardIndex":0}\n' +
        '{"type":"scenario","schemaVersion":1,"scenarioId":"discard-001","data":{}}',
    );
    await expect(runCalibrationJsonlBatchWithExecutor(
      manifest,
      (async function* () { for (const record of records) yield record; })(),
      (scenario) => ({ scenario, input: fixture.input, contentHash: "new-hash" }),
      () => Promise.resolve([]),
      run,
      {
        resumeEvaluations: [{
          scenarioId: "discard-001",
          scenarioContentHash: "old-hash",
          evaluator: "production-weighted",
          evaluatorVersion: "v1",
          candidates: [],
          performance: { durationMs: 0, cacheHits: 0, cacheMisses: 0 },
          status: "ok",
        }],
      },
    )).rejects.toThrow("RESUME_CONTENT_HASH_MISMATCH: discard-001");
  });
});
