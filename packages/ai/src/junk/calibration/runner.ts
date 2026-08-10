import { createCalibrationReport } from "./report.ts";
import type { CalibrationJsonlRecord } from "./jsonl.ts";
import type {
  CalibrationEvaluationResult,
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
): Promise<CalibrationReport> => {
  const evaluations: CalibrationEvaluationResult[] = [];
  const seen = new Set<string>();
  for await (const record of records) {
    if (seen.has(record.scenarioId)) {
      throw new Error(`DUPLICATE_SCENARIO: ${record.scenarioId}`);
    }
    seen.add(record.scenarioId);
    const scenario = manifest.scenarios.find(({ id }) => id === record.scenarioId);
    if (!scenario) throw new Error(`SCENARIO_NOT_FOUND: ${record.scenarioId}`);
    const normalized = resolveRecord(scenario, record.data);
    const evaluation = evaluator(normalized);
    evaluations.push({ ...evaluation, scenarioContentHash: normalized.contentHash });
  }
  return createCalibrationReport(run, manifest, evaluations);
};
