import { evaluateStructuralClaim } from "../structural-claim.ts";
import type { CalibrationEvaluationResult } from "../../evaluation/types.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";

/** Thin evaluation adapter for the non-default structural claim/pass policy. */
export const evaluateStructuralClaimPolicy = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
): CalibrationEvaluationResult => {
  const startedAt = performance.now();
  const result = evaluateStructuralClaim(input.view, input.legalActions);
  return {
    scenarioId,
    evaluator: "structural-claim",
    evaluatorVersion: "v1",
    ...(result.action ? { selectedCandidateId: JSON.stringify(result.action) } : {}),
    candidates: result.candidates.map((candidate) => ({
      candidateId: JSON.stringify(candidate.action),
      action: candidate.action,
      metrics: {
        supported: candidate.supported,
        bestDiscard: candidate.bestDiscard,
        standardShanten: candidate.shape?.standardShanten ?? null,
        liveImprovingKindCount: candidate.shape?.liveImprovingKindCount ?? null,
        liveImprovingTileCount: candidate.shape?.liveImprovingTileCount ?? null,
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
