import {
  CALIBRATION_SCHEMA_VERSION,
  type CalibrationEvaluationResult,
  type CalibrationBatchSummary,
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

export const createCalibrationBatchSummary = (
  evaluations: readonly CalibrationEvaluationResult[],
  durationMs: number,
): CalibrationBatchSummary => {
  const durations = evaluations
    .map(({ performance }) => performance.durationMs)
    .filter((duration) => Number.isFinite(duration) && duration >= 0)
    .sort((left, right) => left - right);
  const percentile = (rank: number): number =>
    durations.length === 0
      ? 0
      : durations[Math.min(durations.length - 1, Math.ceil(durations.length * rank) - 1)]!;
  const statusCounts = {
    ok: evaluations.filter(({ status }) => status === "ok").length,
    failed: evaluations.filter(({ status }) => status === "failed").length,
    skipped: evaluations.filter(({ status }) => status === "skipped").length,
  };
  return {
    scenarioCount: evaluations.length,
    statusCounts,
    durationMs,
    throughputPerSecond: durationMs > 0 ? (evaluations.length * 1000) / durationMs : 0,
    latencyMs: { p50: percentile(0.5), p95: percentile(0.95) },
    failures: evaluations
      .filter(({ status }) => status === "failed")
      .map((evaluation) => ({
        scenarioId: evaluation.scenarioId,
        message: evaluation.error?.message ?? "evaluation failed",
      })),
  };
};

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
  if (report.batch) {
    lines.push(
      `batch: ${report.batch.scenarioCount} scenarios, ${report.batch.durationMs}ms, ` +
        `${report.batch.throughputPerSecond.toFixed(2)}/s, ` +
        `p50=${report.batch.latencyMs.p50}ms, p95=${report.batch.latencyMs.p95}ms`,
      `batch failures: ${report.batch.failures.length}`,
    );
  }
  for (const evaluation of report.evaluations) {
    const selected = evaluation.selectedCandidateId ?? "-";
    lines.push(
      `- ${evaluation.scenarioId} / ${evaluation.evaluator}@${evaluation.evaluatorVersion}: ` +
        `${evaluation.status}, selected=${selected}, ${evaluation.performance.durationMs}ms, ` +
        `candidates=${evaluation.candidates.length}, ` +
        `cache=${evaluation.performance.cacheHits}/${evaluation.performance.cacheMisses}` +
        (evaluation.scenarioContentHash ? `, content=${evaluation.scenarioContentHash}` : ""),
    );
  }
  if (report.baselineComparisons) {
    lines.push("", "Baseline comparisons:");
    for (const comparison of report.baselineComparisons) {
      lines.push(`- ${comparison.baselineId}: ${comparison.status}`);
      for (const change of comparison.changes) lines.push(`  - ${change.kind}: ${change.message}`);
    }
  }
  return `${lines.join("\n")}\n`;
};
