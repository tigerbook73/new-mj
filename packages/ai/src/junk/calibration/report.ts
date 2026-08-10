import {
  CALIBRATION_SCHEMA_VERSION,
  type CalibrationEvaluationResult,
  type CalibrationManifest,
  type CalibrationReport,
  type CalibrationRun,
} from "./types.ts";

const compareEvaluations = (
  left: CalibrationEvaluationResult,
  right: CalibrationEvaluationResult,
): number =>
  left.scenarioId.localeCompare(right.scenarioId) ||
  left.evaluator.localeCompare(right.evaluator) ||
  left.evaluatorVersion.localeCompare(right.evaluatorVersion);

export const createCalibrationReport = (
  run: CalibrationRun,
  manifest: CalibrationManifest,
  evaluations: readonly CalibrationEvaluationResult[],
): CalibrationReport => ({
  schemaVersion: CALIBRATION_SCHEMA_VERSION,
  run,
  manifest: { id: manifest.id, version: manifest.version },
  evaluations: [...evaluations].sort(compareEvaluations),
});

/** Stable machine output: evaluation completion order never changes the JSON. */
export const serializeCalibrationReport = (report: CalibrationReport): string =>
  `${JSON.stringify(report, null, 2)}\n`;

export const formatCalibrationSummary = (report: CalibrationReport): string => {
  const ok = report.evaluations.filter((evaluation) => evaluation.status === "ok").length;
  const failed = report.evaluations.filter((evaluation) => evaluation.status === "failed").length;
  const skipped = report.evaluations.filter((evaluation) => evaluation.status === "skipped").length;
  const lines = [
    "=== Junk structural calibration ===",
    `run: ${report.run.runId}`,
    `manifest: ${report.manifest.id}@${report.manifest.version}`,
    `schema: ${report.schemaVersion}`,
    `evaluations: ${report.evaluations.length} (ok=${ok}, failed=${failed}, skipped=${skipped})`,
    `workers: ${report.run.workerCount}`,
    "",
    "Evaluations:",
  ];
  for (const evaluation of report.evaluations) {
    const selected = evaluation.selectedCandidateId ?? "-";
    lines.push(
      `- ${evaluation.scenarioId} / ${evaluation.evaluator}@${evaluation.evaluatorVersion}: ` +
        `${evaluation.status}, selected=${selected}, ${evaluation.performance.durationMs}ms` +
        (evaluation.scenarioContentHash ? `, content=${evaluation.scenarioContentHash}` : ""),
    );
  }
  return `${lines.join("\n")}\n`;
};
