import type { CalibrationEvaluationResult, CalibrationEvaluatorKind } from "./types.ts";

export type CalibrationBaseline = Readonly<{
  schemaVersion: 1;
  baselineId: string;
  scenarioId: string;
  scenarioContentHash: string;
  evaluator: CalibrationEvaluatorKind;
  evaluatorVersion: string;
  manifest?: Readonly<{ id: string; version: number }>;
  config?: Readonly<Record<string, string | number | boolean>>;
  environment?: Readonly<Record<string, string>>;
  expected: Readonly<{
    selectedCandidateId?: string;
    candidateIds?: readonly string[];
    scores?: Readonly<Record<string, number>>;
  }>;
  limits?: Readonly<{ scoreTolerance?: number; performance?: "informational" }>;
  notes?: string;
}>;

export type CalibrationBaselineChangeKind =
  | "input-mismatch"
  | "evaluator-mismatch"
  | "evaluation-failed"
  | "selection-changed"
  | "candidate-set-changed"
  | "score-changed";

export type CalibrationBaselineComparison = Readonly<{
  baselineId: string;
  scenarioId: string;
  status: "matched" | "changed" | "incompatible";
  changes: readonly Readonly<{
    kind: CalibrationBaselineChangeKind;
    message: string;
  }>[];
}>;

const sorted = (values: readonly string[]): string[] => [...values].sort();

export const compareCalibrationBaseline = (
  baseline: CalibrationBaseline,
  actual: CalibrationEvaluationResult,
): CalibrationBaselineComparison => {
  const changes: Array<{ kind: CalibrationBaselineChangeKind; message: string }> = [];
  if (
    actual.scenarioId !== baseline.scenarioId ||
    actual.scenarioContentHash !== baseline.scenarioContentHash
  ) {
    changes.push({ kind: "input-mismatch", message: "scenario identity or content hash differs" });
  }
  if (
    actual.evaluator !== baseline.evaluator ||
    actual.evaluatorVersion !== baseline.evaluatorVersion
  ) {
    changes.push({ kind: "evaluator-mismatch", message: "evaluator identity or version differs" });
  }
  if (changes.length > 0) {
    return {
      baselineId: baseline.baselineId,
      scenarioId: actual.scenarioId,
      status: "incompatible",
      changes,
    };
  }
  if (actual.status !== "ok") {
    changes.push({ kind: "evaluation-failed", message: actual.error?.message ?? actual.status });
  }
  if (
    baseline.expected.selectedCandidateId !== undefined &&
    actual.selectedCandidateId !== baseline.expected.selectedCandidateId
  ) {
    changes.push({ kind: "selection-changed", message: "selected candidate differs" });
  }
  if (baseline.expected.candidateIds) {
    const expected = sorted(baseline.expected.candidateIds);
    const received = sorted(actual.candidates.map(({ candidateId }) => candidateId));
    if (JSON.stringify(expected) !== JSON.stringify(received)) {
      changes.push({ kind: "candidate-set-changed", message: "candidate IDs differ" });
    }
  }
  if (baseline.expected.scores) {
    const tolerance = baseline.limits?.scoreTolerance ?? 0;
    const actualScores = new Map(
      actual.candidates.map(({ candidateId, metrics }) => [candidateId, metrics.score]),
    );
    const scoreChanged = Object.entries(baseline.expected.scores).some(
      ([candidateId, expected]) => {
        const received = actualScores.get(candidateId);
        return typeof received !== "number" || Math.abs(received - expected) > tolerance;
      },
    );
    if (scoreChanged) changes.push({ kind: "score-changed", message: "candidate scores differ" });
  }
  return {
    baselineId: baseline.baselineId,
    scenarioId: actual.scenarioId,
    status: changes.length === 0 ? "matched" : "changed",
    changes,
  };
};

export const formatCalibrationBaselineComparison = (
  comparison: CalibrationBaselineComparison,
): string => {
  const header = `${comparison.baselineId}: ${comparison.status}`;
  if (comparison.changes.length === 0) return `${header}\n`;
  return `${header}\n${comparison.changes.map(({ kind, message }) => `- ${kind}: ${message}`).join("\n")}\n`;
};
