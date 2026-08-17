import { describe, expect, it } from "vitest";
import snapshotData from "../fixtures/midgame-shape-001.snapshot.json" with { type: "json" };
import { runBatchCalibrationCli } from "./scenario-batch.ts";
import { JUNK_CALIBRATION_MANIFEST } from "../canonical-fixtures.ts";
import type { JunkProductionSnapshotData } from "../snapshot-provider.ts";
import { generateJunkSamples } from "../generated-samples.ts";
import { evaluateStructuralBounded } from "../structural-bounded.ts";

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
    const result = await runBatchCalibrationCli(
      [
        "manifest.json",
        "snapshots.jsonl",
        "--run-id",
        "batch-test-001",
        "--output-dir",
        "/tmp/evaluation-batch-test",
        "--checkpoint",
        "/tmp/evaluation-batch-test/checkpoint.json",
        "--chunk-size",
        "1",
      ],
      {
        now: () => new Date("2026-08-10T00:00:00.000Z"),
        gitSha: "abc1234",
        exists: (filePath) => files.has(filePath),
        read: (filePath) => files.get(filePath)!,
        write: (filePath, content) => files.set(filePath, content),
        makeDirectory: () => undefined,
        records,
        execute: async (tasks) =>
          tasks.map((task) => ({
            taskId: task.taskId,
            result: evaluateStructuralBounded(task.input.scenarioId, task.input.input),
          })),
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("discard-snapshot-001");
    expect(files.get("/tmp/evaluation-batch-test/checkpoint.json")).toContain(
      '"evaluator": "structural-bounded"',
    );
    expect(files.get("/tmp/evaluation-batch-test/junk-batch-test-001.json")).toContain(
      '"scenarioCount": 1',
    );
  });

  it("rejects a checkpoint created for another evaluator", async () => {
    const result = await runBatchCalibrationCli(
      ["manifest.json", "snapshots.jsonl", "--resume", "checkpoint.json"],
      {
        read: (filePath) =>
          filePath === "manifest.json"
            ? JSON.stringify(JUNK_CALIBRATION_MANIFEST)
            : JSON.stringify({
                schemaVersion: 1,
                manifest: {
                  id: JUNK_CALIBRATION_MANIFEST.id,
                  version: JUNK_CALIBRATION_MANIFEST.version,
                },
                evaluator: "standard-only",
                evaluations: [],
              }),
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("INCOMPATIBLE_CHECKPOINT");
  });

  it("runs structural-bounded over generated records", async () => {
    const generated = generateJunkSamples({ seed: 7, count: 1 });
    const sample = generated.samples[0]!;
    const generatedRecords = async function* () {
      yield {
        type: "scenario" as const,
        schemaVersion: 1,
        scenarioId: sample.scenario.id,
        data: sample.data,
        header: {
          type: "header" as const,
          schemaVersion: 1,
          manifestId: generated.manifest.id,
          manifestVersion: generated.manifest.version,
          shardId: "part-0000",
          shardIndex: 0,
          shardCount: 1,
        },
      };
    };
    const files = new Map([["manifest.json", JSON.stringify(generated.manifest)]]);
    const result = await runBatchCalibrationCli(
      [
        "manifest.json",
        "generated.jsonl",
        "--evaluator",
        "structural-bounded",
        "--run-id",
        "generated-test",
        "--output-dir",
        "/tmp/generated-batch-test",
      ],
      {
        gitSha: "abc1234",
        exists: () => false,
        read: (filePath) => files.get(filePath)!,
        write: (filePath, content) => files.set(filePath, content),
        makeDirectory: () => undefined,
        records: generatedRecords,
        execute: async (tasks) =>
          tasks.map((task) => ({
            taskId: task.taskId,
            result: evaluateStructuralBounded(task.input.scenarioId, task.input.input),
          })),
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("structural-bounded@v1");
    expect(result.output).toContain("candidates=14");
    expect(files.get("/tmp/generated-batch-test/junk-generated-test.json")).toContain(
      '"searchedCandidateCount"',
    );
  });
});
