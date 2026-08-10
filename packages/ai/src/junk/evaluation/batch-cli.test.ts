import { describe, expect, it } from "vitest";
import snapshotData from "./fixtures/midgame-shape-001.snapshot.json" with { type: "json" };
import { runBatchCalibrationCli } from "./batch-cli.ts";
import { JUNK_CALIBRATION_MANIFEST } from "./canonical-fixtures.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";
import type { JunkProductionSnapshotData } from "./snapshot-provider.ts";

const scenario = JUNK_CALIBRATION_MANIFEST.scenarios.find(
  ({ id }) => id === "discard-snapshot-001",
)!;

const records = async function* () {
  yield {
    type: "scenario" as const,
    schemaVersion: 1,
    scenarioId: scenario.id,
    data: snapshotData as unknown as JunkProductionSnapshotData,
    header: {
      type: "header" as const,
      schemaVersion: 1,
      manifestId: JUNK_CALIBRATION_MANIFEST.id,
      manifestVersion: JUNK_CALIBRATION_MANIFEST.version,
      shardId: "part-0000",
      shardIndex: 0,
    },
  };
};

describe("evaluation batch CLI", () => {
  it("writes a report and resumable checkpoint through the existing chunk runner", async () => {
    const files = new Map<string, string>([
      ["manifest.json", JSON.stringify(JUNK_CALIBRATION_MANIFEST)],
    ]);
    const result = await runBatchCalibrationCli([
      "manifest.json", "snapshots.jsonl",
      "--run-id", "batch-test-001",
      "--output-dir", "/tmp/evaluation-batch-test",
      "--checkpoint", "/tmp/evaluation-batch-test/checkpoint.json",
      "--chunk-size", "1",
    ], {
      now: () => new Date("2026-08-10T00:00:00.000Z"),
      gitSha: "abc1234",
      exists: (filePath) => files.has(filePath),
      read: (filePath) => files.get(filePath)!,
      write: (filePath, content) => files.set(filePath, content),
      makeDirectory: () => undefined,
      records,
      execute: async (tasks) => tasks.map((task) => ({
        taskId: task.taskId,
        result: evaluateProductionFixture(task.input.scenarioId, task.input.input),
      })),
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("discard-snapshot-001");
    expect(files.get("/tmp/evaluation-batch-test/checkpoint.json")).toContain(
      '"evaluator": "production-weighted"',
    );
    expect(files.get("/tmp/evaluation-batch-test/junk-batch-test-001.json")).toContain(
      '"scenarioCount": 1',
    );
  });

  it("rejects a checkpoint created for another evaluator", async () => {
    const result = await runBatchCalibrationCli([
      "manifest.json", "snapshots.jsonl", "--resume", "checkpoint.json",
    ], {
      read: (filePath) => filePath === "manifest.json"
        ? JSON.stringify(JUNK_CALIBRATION_MANIFEST)
        : JSON.stringify({
          schemaVersion: 1,
          manifest: { id: JUNK_CALIBRATION_MANIFEST.id, version: JUNK_CALIBRATION_MANIFEST.version },
          evaluator: "two-ply-all",
          evaluations: [],
        }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("INCOMPATIBLE_CHECKPOINT");
  });
});
