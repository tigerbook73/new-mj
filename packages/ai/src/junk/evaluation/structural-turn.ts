import type { CalibrationEvaluationResult } from "../../evaluation/types.ts";
import { evaluateStructuralTurn } from "../structural-turn.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";

/** Thin evaluation adapter for the non-default structural self-turn policy. */
export const evaluateStructuralTurnPolicy = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
): CalibrationEvaluationResult => {
  const startedAt = performance.now();
  const result = evaluateStructuralTurn(input.view, input.legalActions);
  return {
    scenarioId,
    evaluator: "structural-turn",
    evaluatorVersion: "v1",
    ...(result.action ? { selectedCandidateId: JSON.stringify(result.action) } : {}),
    candidates: result.candidates.map((candidate) => ({
      candidateId: JSON.stringify(candidate.action),
      action: candidate.action,
      metrics: {
        supported: candidate.supported,
        drawKindCount: candidate.drawKindCount,
        leafCount: candidate.leafCount,
        immediateCompletionMass: candidate.immediateCompletionMass,
        conditionalExpectedBestShanten: candidate.conditionalExpectedBestShanten,
        conditionalExpectedBestLiveImprovingKindCount:
          candidate.conditionalExpectedBestLiveImprovingKindCount,
        conditionalExpectedBestLiveImprovingTileCount:
          candidate.conditionalExpectedBestLiveImprovingTileCount,
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
