import { chooseLegacyWeightedJunkAction, type JunkStrengthConfig } from "../strategy.ts";
import type { CalibrationEvaluationResult } from "../../evaluation/types.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";

export type ProductionEvaluatorOptions = Readonly<{
  evaluatorVersion?: string;
  strength?: JunkStrengthConfig;
}>;

/**
 * First real adapter for the evaluation platform. It deliberately evaluates
 * the existing production decision boundary only; structural metrics belong to
 * the later StructuralMetrics step.
 */
export const evaluateProductionFixture = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
  options: ProductionEvaluatorOptions = {},
): CalibrationEvaluationResult => {
  const startedAt = performance.now();
  const action = chooseLegacyWeightedJunkAction(input.view, input.legalActions, options.strength);
  const selectedCandidateId = JSON.stringify(action);
  return {
    scenarioId,
    evaluator: "production-weighted",
    evaluatorVersion: options.evaluatorVersion ?? "v1",
    selectedCandidateId,
    candidates: [
      {
        candidateId: selectedCandidateId,
        action,
        metrics: { legalActionCount: input.legalActions.length },
      },
    ],
    performance: {
      durationMs: performance.now() - startedAt,
      cacheHits: options.strength?.analysisCache?.hits ?? 0,
      cacheMisses: options.strength?.analysisCache?.misses ?? 0,
    },
    status: "ok",
  };
};
