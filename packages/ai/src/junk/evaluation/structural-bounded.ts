import { evaluateStructuralDiscard } from "../structural-discard.ts";
import type { CalibrationEvaluationResult } from "../../evaluation/types.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";

/** Thin evaluation adapter for the bounded, non-default structural discard policy. */
export const evaluateStructuralBounded = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
): CalibrationEvaluationResult => {
  const startedAt = performance.now();
  const result = evaluateStructuralDiscard(input.view, input.legalActions);
  return {
    scenarioId,
    evaluator: "structural-bounded",
    evaluatorVersion: "v1",
    ...(result.action ? { selectedCandidateId: JSON.stringify(result.action) } : {}),
    candidates: result.candidates.map((candidate) => ({
      candidateId: JSON.stringify(candidate.action),
      action: candidate.action,
      metrics: {
        standardShanten: candidate.onePly.standardShanten,
        liveImprovingKindCount: candidate.onePly.liveImprovingKindCount,
        liveImprovingTileCount: candidate.onePly.liveImprovingTileCount,
        searched: candidate.searched,
        dominated: candidate.dominated,
        immediateCompletionMass: candidate.immediateCompletionMass,
        conditionalExpectedBestShanten: candidate.conditionalExpectedBestShanten,
        conditionalExpectedBestLiveImprovingKindCount:
          candidate.conditionalExpectedBestLiveImprovingKindCount,
        conditionalExpectedBestLiveImprovingTileCount:
          candidate.conditionalExpectedBestLiveImprovingTileCount,
        searchedCandidateCount: result.searchedCandidateCount,
        leafCount: result.leafCount,
      },
    })),
    performance: {
      durationMs: performance.now() - startedAt,
      cacheHits: 0,
      cacheMisses: 0,
    },
    status: "ok",
  };
};
