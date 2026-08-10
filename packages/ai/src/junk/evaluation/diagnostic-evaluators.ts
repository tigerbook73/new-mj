import {
  createJunkAnalysisCache,
  scoreDiscardActionsTwoPlyAll,
  scoreLegalActionsOnePlyAll,
  type ScoredAction,
} from "../strategy.ts";
import type { CalibrationEvaluationResult } from "../../evaluation/types.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";

const evaluateScored = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
  evaluator: "one-ply-all" | "two-ply-all",
  score: (cache: ReturnType<typeof createJunkAnalysisCache>) => ScoredAction[],
): CalibrationEvaluationResult => {
  const startedAt = performance.now();
  const cache = createJunkAnalysisCache();
  const scored = score(cache);
  const ranked = scored
    .map(({ action, score: value }) => ({ action, score: value }))
    .sort((left, right) => right.score - left.score);
  const candidates = ranked.map(({ action, score: value }) => ({
    candidateId: JSON.stringify(action),
    action,
    metrics: { score: value },
  }));
  return {
    scenarioId,
    evaluator,
    evaluatorVersion: "v1",
    ...(candidates[0] ? { selectedCandidateId: candidates[0].candidateId } : {}),
    candidates,
    performance: {
      durationMs: performance.now() - startedAt,
      cacheHits: cache.hits,
      cacheMisses: cache.misses,
    },
    status: "ok",
  };
};

export const evaluateOnePlyAll = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
): CalibrationEvaluationResult =>
  evaluateScored(scenarioId, input, "one-ply-all", (cache) =>
    scoreLegalActionsOnePlyAll(input.view, input.legalActions, undefined, cache),
  );

export const evaluateTwoPlyAll = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
): CalibrationEvaluationResult =>
  evaluateScored(scenarioId, input, "two-ply-all", (cache) =>
    scoreDiscardActionsTwoPlyAll(input.view, input.legalActions, undefined, cache),
  );
