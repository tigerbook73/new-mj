import { createCalibrationReport } from "./report.ts";
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
  return createCalibrationReport(run, manifest, [evaluation]);
};
