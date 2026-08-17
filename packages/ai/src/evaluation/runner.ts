import { createCalibrationBatchSummary, createCalibrationReport } from "./report.ts";
import type { CalibrationJsonlRecord } from "./jsonl.ts";
import type { CalibrationTask } from "./executor.ts";
import type {
  CalibrationEvaluationResult,
  CalibrationEvaluatorKind,
  CalibrationManifest,
  CalibrationReport,
  CalibrationRun,
  NormalizedCalibrationScenario,
} from "./types.ts";

export type CalibrationScenarioProvider<TInput> = Readonly<{
  resolve: (
    scenario: CalibrationManifest["scenarios"][number],
  ) => NormalizedCalibrationScenario<TInput>;
}>;

export type CalibrationEvaluator<TInput> = (
  scenario: NormalizedCalibrationScenario<TInput>,
) => CalibrationEvaluationResult;

/**
 * Runs exactly one scenario. The runner owns orchestration only: source
 * resolution, evaluator invocation and report construction. It intentionally
 * has no concurrency, retry, domain scoring or file I/O yet.
 */
export const runSingleCalibrationScenario = <TInput>(
  manifest: CalibrationManifest,
  scenarioId: string,
  provider: CalibrationScenarioProvider<TInput>,
  evaluator: CalibrationEvaluator<TInput>,
  run: CalibrationRun,
): CalibrationReport => {
  return runSingleCalibrationScenarioEvaluators(manifest, scenarioId, provider, [evaluator], run);
};

/** Runs multiple evaluator adapters against one resolved, hash-stable input. */
export const runSingleCalibrationScenarioEvaluators = <TInput>(
  manifest: CalibrationManifest,
  scenarioId: string,
  provider: CalibrationScenarioProvider<TInput>,
  evaluators: readonly CalibrationEvaluator<TInput>[],
  run: CalibrationRun,
): CalibrationReport => {
  const scenario = manifest.scenarios.find(({ id }) => id === scenarioId);
  if (!scenario) throw new Error(`SCENARIO_NOT_FOUND: ${scenarioId}`);
  const normalized = provider.resolve(scenario);
  const evaluations = evaluators.map((evaluate) => ({
    ...evaluate(normalized),
    scenarioContentHash: normalized.contentHash,
  }));
  return createCalibrationReport(run, manifest, evaluations);
};

export type CalibrationJsonlRecordResolver<TRecordData, TInput> = (
  scenario: CalibrationManifest["scenarios"][number],
  data: TRecordData,
) => NormalizedCalibrationScenario<TInput>;

export type CalibrationEvaluationTaskInput<TInput> = Readonly<{
  scenarioId: string;
  input: TInput;
  contentHash: string;
}>;

export type CalibrationEvaluationTaskExecutor<TInput> = (
  tasks: readonly CalibrationTask<CalibrationEvaluationTaskInput<TInput>>[],
) => Promise<readonly Readonly<{ taskId: string; result: CalibrationEvaluationResult }>[]>;

export type CalibrationBatchProgress = Readonly<{
  seen: number;
  executed: number;
  resumed: number;
  failed: number;
  lastScenarioId: string;
}>;

export type CalibrationBatchCheckpoint = Readonly<{
  progress: CalibrationBatchProgress;
  evaluations: readonly CalibrationEvaluationResult[];
}>;

export type CalibrationBatchExecutorOptions = Readonly<{
  chunkSize?: number;
  resumeEvaluations?: readonly CalibrationEvaluationResult[];
  onProgress?: (progress: CalibrationBatchProgress) => void | Promise<void>;
  onCheckpoint?: (checkpoint: CalibrationBatchCheckpoint) => void | Promise<void>;
}>;

export const runCalibrationEvaluationsWithExecutor = async <TInput>(
  manifest: CalibrationManifest,
  scenarios: readonly NormalizedCalibrationScenario<TInput>[],
  execute: CalibrationEvaluationTaskExecutor<TInput>,
  run: CalibrationRun,
): Promise<CalibrationReport> => {
  const startedAt = performance.now();
  const tasks = scenarios.map((scenario) => ({
    taskId: scenario.scenario.id,
    input: {
      scenarioId: scenario.scenario.id,
      input: scenario.input,
      contentHash: scenario.contentHash,
    },
  }));
  const results = await execute(tasks);
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const evaluations = results.map(({ taskId, result }) => {
    const task = taskById.get(taskId);
    if (!task) throw new Error(`TASK_RESULT_NOT_FOUND: ${taskId}`);
    return {
      ...result,
      scenarioId: taskId,
      scenarioContentHash: result.scenarioContentHash ?? task.input.contentHash,
    };
  });
  const report = createCalibrationReport(run, manifest, evaluations);
  return {
    ...report,
    batch: createCalibrationBatchSummary(evaluations, performance.now() - startedAt),
  };
};

export const runCalibrationJsonlBatchWithExecutor = async <TRecordData, TInput>(
  manifest: CalibrationManifest,
  records: AsyncIterable<CalibrationJsonlRecord<TRecordData>>,
  resolveRecord: CalibrationJsonlRecordResolver<TRecordData, TInput>,
  execute: CalibrationEvaluationTaskExecutor<TInput>,
  run: CalibrationRun,
  options: CalibrationBatchExecutorOptions = {},
): Promise<CalibrationReport> => {
  const chunkSize = options.chunkSize ?? 64;
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("INVALID_BATCH_CHUNK_SIZE");
  }
  const startedAt = performance.now();
  const evaluations: CalibrationEvaluationResult[] = [];
  const chunk: NormalizedCalibrationScenario<TInput>[] = [];
  const seen = new Set<string>();
  const resumeById = new Map<string, CalibrationEvaluationResult>();
  for (const evaluation of options.resumeEvaluations ?? []) {
    if (resumeById.has(evaluation.scenarioId)) {
      throw new Error(`DUPLICATE_RESUME_SCENARIO: ${evaluation.scenarioId}`);
    }
    resumeById.set(evaluation.scenarioId, evaluation);
  }
  let executed = 0;
  let resumed = 0;
  let failed = 0;
  let lastScenarioId = "";
  const currentProgress = (): CalibrationBatchProgress => ({
    seen: seen.size,
    executed,
    resumed,
    failed,
    lastScenarioId,
  });
  const emitProgress = async (): Promise<void> => {
    if (!options.onProgress || !lastScenarioId) return;
    await options.onProgress(currentProgress());
  };
  const flush = async (): Promise<void> => {
    if (chunk.length === 0) return;
    const chunkReport = await runCalibrationEvaluationsWithExecutor(manifest, chunk, execute, run);
    evaluations.push(...chunkReport.evaluations);
    executed += chunkReport.evaluations.length;
    failed += chunkReport.evaluations.filter(({ status }) => status === "failed").length;
    chunk.length = 0;
    await emitProgress();
    await options.onCheckpoint?.({
      progress: currentProgress(),
      evaluations: chunkReport.evaluations,
    });
  };
  for await (const record of records) {
    if (seen.has(record.scenarioId)) throw new Error(`DUPLICATE_SCENARIO: ${record.scenarioId}`);
    seen.add(record.scenarioId);
    lastScenarioId = record.scenarioId;
    const scenario = manifest.scenarios.find(({ id }) => id === record.scenarioId);
    if (!scenario) throw new Error(`SCENARIO_NOT_FOUND: ${record.scenarioId}`);
    const normalized = resolveRecord(scenario, record.data);
    const resumedEvaluation = resumeById.get(record.scenarioId);
    if (resumedEvaluation) {
      if (!resumedEvaluation.scenarioContentHash) {
        throw new Error(`RESUME_CONTENT_HASH_MISSING: ${record.scenarioId}`);
      }
      if (resumedEvaluation.scenarioContentHash !== normalized.contentHash) {
        throw new Error(`RESUME_CONTENT_HASH_MISMATCH: ${record.scenarioId}`);
      }
      evaluations.push(resumedEvaluation);
      resumed += 1;
      failed += resumedEvaluation.status === "failed" ? 1 : 0;
      await emitProgress();
      continue;
    }
    chunk.push(normalized);
    if (chunk.length >= chunkSize) await flush();
  }
  await flush();
  const report = createCalibrationReport(run, manifest, evaluations);
  return {
    ...report,
    batch: createCalibrationBatchSummary(evaluations, performance.now() - startedAt),
  };
};

/**
 * Sequential streaming runner. It consumes JSONL records without materializing
 * the input set; concurrency, retry and progress reporting belong to the later
 * executor layer.
 */
export const runCalibrationJsonlBatch = async <TRecordData, TInput>(
  manifest: CalibrationManifest,
  records: AsyncIterable<CalibrationJsonlRecord<TRecordData>>,
  resolveRecord: CalibrationJsonlRecordResolver<TRecordData, TInput>,
  evaluator: CalibrationEvaluator<TInput>,
  run: CalibrationRun,
  options: Readonly<{ evaluatorKind: CalibrationEvaluatorKind }> = {
    evaluatorKind: "standard-only",
  },
): Promise<CalibrationReport> => {
  const evaluations: CalibrationEvaluationResult[] = [];
  const seen = new Set<string>();
  const startedAt = performance.now();
  for await (const record of records) {
    if (seen.has(record.scenarioId)) {
      throw new Error(`DUPLICATE_SCENARIO: ${record.scenarioId}`);
    }
    seen.add(record.scenarioId);
    const scenario = manifest.scenarios.find(({ id }) => id === record.scenarioId);
    if (!scenario) throw new Error(`SCENARIO_NOT_FOUND: ${record.scenarioId}`);
    const normalized = resolveRecord(scenario, record.data);
    try {
      const evaluation = evaluator(normalized);
      evaluations.push({ ...evaluation, scenarioContentHash: normalized.contentHash });
    } catch (error) {
      evaluations.push({
        scenarioId: scenario.id,
        evaluator: options.evaluatorKind,
        evaluatorVersion: "unknown",
        candidates: [],
        performance: { durationMs: 0, cacheHits: 0, cacheMisses: 0 },
        status: "failed",
        error: {
          code: "EVALUATOR_FAILED",
          message: error instanceof Error ? error.message : "unknown error",
        },
      });
    }
  }
  const report = createCalibrationReport(run, manifest, evaluations);
  return {
    ...report,
    batch: createCalibrationBatchSummary(evaluations, performance.now() - startedAt),
  };
};
