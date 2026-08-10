import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { executeCalibrationTasksInWorkers } from "../../../evaluation/executor.ts";
import {
  runResumableCalibrationBatch,
  type CalibrationBatchCheckpoint,
} from "../../../evaluation/batch.ts";
import { readCalibrationJsonl, type CalibrationJsonlRecord } from "../../../evaluation/jsonl.ts";
import {
  formatCalibrationSummary,
  serializeCalibrationReport,
} from "../../../evaluation/report.ts";
import type { CalibrationEvaluationTaskExecutor } from "../../../evaluation/runner.ts";
import type { CalibrationEvaluatorKind, CalibrationManifest } from "../../../evaluation/types.ts";
import { normalizeJunkSnapshot, type JunkProductionSnapshotData } from "../snapshot-provider.ts";
import type { JunkEvaluationTaskInput } from "../evaluation-task.ts";

export const batchUsage =
  "Usage: pnpm --filter @new-mj/ai evaluate scenario batch <manifest.json> <scenarios.jsonl> [options]\n\n" +
  "Options:\n" +
  "  --evaluator <production-weighted|one-ply-all|two-ply-all>\n" +
  "  --workers <n>                 Worker thread count (default: 1)\n" +
  "  --chunk-size <n>               Scenarios per checkpoint (default: 64)\n" +
  "  --checkpoint <file>            Write resumable JSON after every chunk\n" +
  "  --resume <file>                Resume a compatible checkpoint\n" +
  "  --output-dir <dir>             Final report directory\n" +
  "  --run-id <id>                  Stable output filename prefix\n";

type Runtime = Readonly<{
  now?: () => Date;
  gitSha?: string;
  exists?: (filePath: string) => boolean;
  read?: (filePath: string) => string;
  write?: (filePath: string, content: string) => void;
  makeDirectory?: (directory: string) => void;
  records?: (filePath: string) => AsyncIterable<CalibrationJsonlRecord<JunkProductionSnapshotData>>;
  execute?: CalibrationEvaluationTaskExecutor<JunkEvaluationTaskInput["input"]>;
}>;

const positiveInteger = (value: string | undefined, name: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`INVALID_${name}`);
  return parsed;
};

const gitSha = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

export const runBatchCalibrationCli = async (
  argv: readonly string[],
  runtime: Runtime = {},
): Promise<{ exitCode: number; output: string }> => {
  try {
    const manifestPath = argv[0];
    const recordsPath = argv[1];
    if (!manifestPath || !recordsPath || argv.includes("--help")) throw new Error(batchUsage);
    let evaluator: CalibrationEvaluatorKind = "production-weighted";
    let workers = 1;
    let chunkSize = 64;
    let outputDir = "packages/ai/.evaluation-runs";
    let runId: string | undefined;
    let checkpointPath: string | undefined;
    let resumePath: string | undefined;
    for (let index = 2; index < argv.length; index += 2) {
      const flag = argv[index];
      const value = argv[index + 1];
      if (!value) throw new Error(`MISSING_VALUE: ${flag}`);
      if (flag === "--evaluator") evaluator = value as CalibrationEvaluatorKind;
      else if (flag === "--workers") workers = positiveInteger(value, "WORKER_COUNT");
      else if (flag === "--chunk-size") chunkSize = positiveInteger(value, "CHUNK_SIZE");
      else if (flag === "--output-dir") outputDir = value;
      else if (flag === "--run-id") runId = value;
      else if (flag === "--checkpoint") checkpointPath = value;
      else if (flag === "--resume") resumePath = value;
      else throw new Error(`UNKNOWN_ARGUMENT: ${flag}`);
    }
    if (!["production-weighted", "one-ply-all", "two-ply-all"].includes(evaluator))
      throw new Error(`UNSUPPORTED_BATCH_EVALUATOR: ${evaluator}`);
    const read = runtime.read ?? ((filePath: string) => readFileSync(filePath, "utf8"));
    const write =
      runtime.write ?? ((filePath: string, content: string) => writeFileSync(filePath, content));
    const manifest = JSON.parse(read(manifestPath)) as CalibrationManifest;
    const startedAt = (runtime.now ?? (() => new Date()))();
    const stableRunId = runId ?? `batch-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    const directory = path.resolve(outputDir);
    const jsonPath = path.join(directory, `junk-${stableRunId}.json`);
    const markdownPath = path.join(directory, `junk-${stableRunId}.md`);
    const exists = runtime.exists ?? existsSync;
    if (exists(jsonPath) || exists(markdownPath))
      throw new Error(`OUTPUT_ALREADY_EXISTS: ${stableRunId}`);
    const execute =
      runtime.execute ??
      ((tasks) =>
        executeCalibrationTasksInWorkers(
          tasks.map((task) => ({ ...task, input: { ...task.input, evaluator } })),
          {
            workerCount: workers,
            workerUrl: new URL("../../../evaluation/worker.ts", import.meta.url),
            moduleUrl: new URL("../evaluation-task.ts", import.meta.url),
            exportName: "evaluateJunkTask",
          },
        ));
    const sourceRecords = (runtime.records ?? readCalibrationJsonl<JunkProductionSnapshotData>)(
      recordsPath,
    );
    const checkpointStore =
      checkpointPath || resumePath
        ? {
            load: (): CalibrationBatchCheckpoint | undefined =>
              resumePath ? (JSON.parse(read(resumePath)) as CalibrationBatchCheckpoint) : undefined,
            save: (checkpoint: CalibrationBatchCheckpoint): void => {
              if (!checkpointPath) return;
              (runtime.makeDirectory ?? ((value) => mkdirSync(value, { recursive: true })))(
                path.dirname(path.resolve(checkpointPath)),
              );
              write(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
            },
          }
        : undefined;
    const report = await runResumableCalibrationBatch(
      manifest,
      sourceRecords,
      (scenario, data) => normalizeJunkSnapshot(scenario, data),
      execute,
      {
        runId: stableRunId,
        gitSha: runtime.gitSha ?? gitSha(),
        command: `pnpm --filter @new-mj/ai evaluate scenario batch ${argv.join(" ")}`,
        configHash: `${manifest.id}@${manifest.version}:${evaluator}`,
        startedAt: startedAt.toISOString(),
        workerCount: workers,
      },
      {
        evaluator,
        chunkSize,
        ...(checkpointStore ? { checkpointStore } : {}),
      },
    );
    (runtime.makeDirectory ?? ((value) => mkdirSync(value, { recursive: true })))(directory);
    write(jsonPath, serializeCalibrationReport(report));
    write(markdownPath, formatCalibrationSummary(report));
    return {
      exitCode: 0,
      output: `${formatCalibrationSummary(report)}json: ${jsonPath}\nmarkdown: ${markdownPath}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${batchUsage}`,
    };
  }
};
