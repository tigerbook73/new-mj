import { describe, expect, it } from "vitest";
import { CALIBRATION_SCHEMA_VERSION, type CalibrationManifest } from "./types.ts";
import { runResumableCalibrationBatch, type CalibrationBatchCheckpoint } from "./batch.ts";

const manifest: CalibrationManifest = {
  schemaVersion: CALIBRATION_SCHEMA_VERSION,
  id: "batch-test",
  version: 1,
  scenarios: [{ id: "scenario-a", version: 1, source: { kind: "snapshot", snapshotId: "a" } }],
};

const records = async function* (manifestId = "batch-test") {
  yield {
    type: "scenario" as const,
    schemaVersion: 1,
    scenarioId: "scenario-a",
    data: { value: 1 },
    header: {
      type: "header" as const,
      schemaVersion: 1,
      manifestId,
      manifestVersion: 1,
      shardId: "part-0000",
      shardIndex: 0,
    },
  };
};

describe("resumable calibration batch", () => {
  it("owns checkpoint persistence independently of a ruleset adapter", async () => {
    let checkpoint: CalibrationBatchCheckpoint | undefined;
    const report = await runResumableCalibrationBatch(
      manifest,
      records(),
      (scenario, data) => ({ scenario, input: data, contentHash: "hash-a" }),
      async (tasks) =>
        tasks.map((task) => ({
          taskId: task.taskId,
          result: {
            scenarioId: task.taskId,
            evaluator: "one-ply-all" as const,
            evaluatorVersion: "v1",
            candidates: [],
            performance: { durationMs: 1, cacheHits: 0, cacheMisses: 0 },
            status: "ok" as const,
          },
        })),
      {
        runId: "run-a",
        gitSha: "sha",
        command: "test",
        configHash: "hash",
        startedAt: "2026-08-10T00:00:00.000Z",
        workerCount: 1,
      },
      {
        evaluator: "one-ply-all",
        chunkSize: 1,
        checkpointStore: {
          load: () => undefined,
          save: (value) => {
            checkpoint = value;
          },
        },
      },
    );
    expect(report.batch?.scenarioCount).toBe(1);
    expect(checkpoint?.evaluations[0]?.scenarioContentHash).toBe("hash-a");
  });

  it("rejects a JSONL shard for another manifest", async () => {
    await expect(
      runResumableCalibrationBatch(
        manifest,
        records("other"),
        (scenario, data) => ({ scenario, input: data, contentHash: "hash-a" }),
        async () => [],
        { runId: "r", gitSha: "s", command: "c", configHash: "h", startedAt: "t", workerCount: 1 },
        { evaluator: "production-weighted" },
      ),
    ).rejects.toThrow("JSONL_MANIFEST_MISMATCH");
  });
});
