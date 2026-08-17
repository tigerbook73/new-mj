import type { CalibrationJsonlRecord } from "./jsonl.ts";
import {
  runCalibrationJsonlBatchWithExecutor,
  type CalibrationBatchExecutorOptions,
  type CalibrationEvaluationTaskExecutor,
  type CalibrationJsonlRecordResolver,
} from "./runner.ts";
import type {
  CalibrationEvaluationResult,
  CalibrationEvaluatorKind,
  CalibrationManifest,
  CalibrationReport,
  CalibrationRun,
} from "./types.ts";

export type CalibrationBatchCheckpoint = Readonly<{
  schemaVersion: 1;
  manifest: Readonly<{ id: string; version: number }>;
  evaluator: CalibrationEvaluatorKind;
  evaluations: readonly CalibrationEvaluationResult[];
}>;

export type CalibrationCheckpointStore = Readonly<{
  load: () =>
    CalibrationBatchCheckpoint | undefined | Promise<CalibrationBatchCheckpoint | undefined>;
  save: (checkpoint: CalibrationBatchCheckpoint) => void | Promise<void>;
}>;

export type ResumableCalibrationBatchOptions = Pick<
  CalibrationBatchExecutorOptions,
  "chunkSize" | "onProgress"
> &
  Readonly<{
    evaluator: CalibrationEvaluatorKind;
    checkpointStore?: CalibrationCheckpointStore;
  }>;

const validateCheckpoint = (
  checkpoint: CalibrationBatchCheckpoint,
  manifest: CalibrationManifest,
  evaluator: CalibrationEvaluatorKind,
): void => {
  if (checkpoint.schemaVersion !== 1 || !Array.isArray(checkpoint.evaluations))
    throw new Error("INVALID_CHECKPOINT");
  if (
    checkpoint.manifest.id !== manifest.id ||
    checkpoint.manifest.version !== manifest.version ||
    checkpoint.evaluator !== evaluator
  )
    throw new Error("INCOMPATIBLE_CHECKPOINT");
};

const validateRecordHeaders = async function* <TData>(
  manifest: CalibrationManifest,
  records: AsyncIterable<CalibrationJsonlRecord<TData>>,
): AsyncGenerator<CalibrationJsonlRecord<TData>> {
  for await (const record of records) {
    if (
      record.header.manifestId !== manifest.id ||
      record.header.manifestVersion !== manifest.version ||
      record.header.schemaVersion !== manifest.schemaVersion
    )
      throw new Error("JSONL_MANIFEST_MISMATCH");
    yield record;
  }
};

/** Generic resumable batch orchestration; ruleset code supplies only adapters. */
export const runResumableCalibrationBatch = async <TData, TInput>(
  manifest: CalibrationManifest,
  records: AsyncIterable<CalibrationJsonlRecord<TData>>,
  resolveRecord: CalibrationJsonlRecordResolver<TData, TInput>,
  execute: CalibrationEvaluationTaskExecutor<TInput>,
  run: CalibrationRun,
  options: ResumableCalibrationBatchOptions,
): Promise<CalibrationReport> => {
  const restored = await options.checkpointStore?.load();
  if (restored) validateCheckpoint(restored, manifest, options.evaluator);
  const completed = [...(restored?.evaluations ?? [])];
  return runCalibrationJsonlBatchWithExecutor(
    manifest,
    validateRecordHeaders(manifest, records),
    resolveRecord,
    execute,
    run,
    {
      ...(options.chunkSize === undefined ? {} : { chunkSize: options.chunkSize }),
      ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      ...(restored ? { resumeEvaluations: restored.evaluations } : {}),
      onCheckpoint: async ({ evaluations }) => {
        completed.push(...evaluations);
        await options.checkpointStore?.save({
          schemaVersion: 1,
          manifest: { id: manifest.id, version: manifest.version },
          evaluator: options.evaluator,
          evaluations: completed,
        });
      },
    },
  );
};
