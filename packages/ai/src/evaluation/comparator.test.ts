import { describe, expect, it } from "vitest";
import {
  compareCalibrationBaseline,
  formatCalibrationBaselineComparison,
  type CalibrationBaseline,
} from "./comparator.ts";
import type { CalibrationEvaluationResult } from "./types.ts";

const baseline: CalibrationBaseline = {
  schemaVersion: 1,
  baselineId: "scenario-a-one-ply-v1",
  scenarioId: "scenario-a",
  scenarioContentHash: "hash-a",
  evaluator: "one-ply-all",
  evaluatorVersion: "v1",
  expected: {
    selectedCandidateId: "discard-a",
    candidateIds: ["discard-a", "discard-b"],
    scores: { "discard-a": 10, "discard-b": 9 },
  },
  limits: { scoreTolerance: 0.01, performance: "informational" },
};

const actual: CalibrationEvaluationResult = {
  scenarioId: "scenario-a",
  scenarioContentHash: "hash-a",
  evaluator: "one-ply-all",
  evaluatorVersion: "v1",
  selectedCandidateId: "discard-a",
  candidates: [
    { candidateId: "discard-b", action: {}, metrics: { score: 9.005 } },
    { candidateId: "discard-a", action: {}, metrics: { score: 10 } },
  ],
  performance: { durationMs: 999, cacheHits: 0, cacheMisses: 0 },
  status: "ok",
};

describe("calibration baseline comparator", () => {
  it("matches stable quality fields while ignoring duration and candidate order", () => {
    const comparison = compareCalibrationBaseline(baseline, actual);
    expect(comparison.status).toBe("matched");
    expect(formatCalibrationBaselineComparison(comparison)).toBe(
      "scenario-a-one-ply-v1: matched\n",
    );
  });

  it("classifies selection, candidate-set and score changes independently", () => {
    const comparison = compareCalibrationBaseline(baseline, {
      ...actual,
      selectedCandidateId: "discard-b",
      candidates: [{ candidateId: "discard-b", action: {}, metrics: { score: 7 } }],
    });
    expect(comparison.status).toBe("changed");
    expect(comparison.changes.map(({ kind }) => kind)).toEqual([
      "selection-changed",
      "candidate-set-changed",
      "score-changed",
    ]);
  });

  it("rejects a stale content hash before comparing quality", () => {
    const comparison = compareCalibrationBaseline(baseline, {
      ...actual,
      scenarioContentHash: "hash-new",
    });
    expect(comparison.status).toBe("incompatible");
    expect(comparison.changes[0]?.kind).toBe("input-mismatch");
  });
});
