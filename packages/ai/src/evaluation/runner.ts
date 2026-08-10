import { createCalibrationBatchSummary, createCalibrationReport } from "./report.ts";
import type { CalibrationJsonlRecord } from "./jsonl.ts";
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
  const scenario = manifest.scenarios.find(({ id }) => id === scenarioId);
  if (!scenario) throw new Error(`SCENARIO_NOT_FOUND: ${scenarioId}`);
  const normalized = provider.resolve(scenario);
  const evaluation = evaluator(normalized);
  const evaluationWithHash = {
    ...evaluation,
    scenarioContentHash: normalized.contentHash,
  };
  return createCalibrationReport(run, manifest, [evaluationWithHash]);
};

export type CalibrationJsonlRecordResolver<TRecordData, TInput> = (
  scenario: CalibrationManifest["scenarios"][number],
  data: TRecordData,
) => NormalizedCalibrationScenario<TInput>;

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
  options: Readonly<{ evaluatorKind: CalibrationEvaluatorKind }> = { evaluatorKind: "standard-only" },
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
        error: { code: "EVALUATOR_FAILED", message: error instanceof Error ? error.message : "unknown error" },
      });
    }
  }
  const report = createCalibrationReport(run, manifest, evaluations);
  return {
    ...report,
    batch: createCalibrationBatchSummary(evaluations, performance.now() - startedAt),
  };
};
