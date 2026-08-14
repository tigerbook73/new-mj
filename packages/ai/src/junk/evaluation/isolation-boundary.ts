import type {
  CalibrationCandidateResult,
  CalibrationEvaluationResult,
} from "../../evaluation/types.ts";
import type { JunkAction } from "@new-mj/core";
import {
  createJunkAnalysisCache,
  DEFAULT_JUNK_WEIGHTS,
  scoreDiscardActionsTwoPlyAll,
  scoreLegalActionsOnePlyAll,
  type JunkWeights,
} from "../strategy.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";
import { evaluateStructuralMetrics } from "./structural-metrics.ts";
import { evaluateStructuralTwoPlyAll } from "./structural-two-ply.ts";

type MutableMetrics = Record<string, number | string | boolean | null | readonly string[]>;

const scoreByCandidate = (
  scored: readonly Readonly<{ action: JunkAction; score: number }>[],
): Map<string, number> =>
  new Map(scored.map(({ action, score }) => [JSON.stringify(action), score]));

const structuralKey = (
  onePly: CalibrationCandidateResult,
  twoPly: CalibrationCandidateResult,
): string => {
  const one = onePly.metrics;
  const two = twoPly.metrics;
  return JSON.stringify([
    one.standardShanten,
    one.liveImprovingKindCount,
    one.liveImprovingTileCount,
    two.drawKindCount,
    two.drawProbabilityMass,
    two.immediateCompletionMass,
    two.continuationMass,
    two.conditionalExpectedBestShanten,
    two.secondDiscardCandidateCount,
    two.secondDiscardFrontierCount,
  ]);
};

const rankWithin = (
  ids: readonly string[],
  scores: ReadonlyMap<string, number>,
  candidateId: string,
): number => {
  const score = scores.get(candidateId)!;
  return ids.filter((id) => scores.get(id)! > score).length + 1;
};

/**
 * Paired, read-only isolationPotential boundary diagnostic.
 * It compares default weights with an otherwise identical isolationPotential=0 policy, but only
 * attributes within-group changes after standard one-ply and structural two-ply metrics tie.
 */
export const evaluateIsolationBoundary = (
  scenarioId: string,
  input: JunkProductionFixtureInput,
): CalibrationEvaluationResult => {
  const startedAt = performance.now();
  const withoutIsolation: JunkWeights = { ...DEFAULT_JUNK_WEIGHTS, isolationPotential: 0 };
  const structural = evaluateStructuralMetrics(scenarioId, input);
  const structuralTwoPly = evaluateStructuralTwoPlyAll(scenarioId, input);
  const caches = [
    createJunkAnalysisCache(),
    createJunkAnalysisCache(),
    createJunkAnalysisCache(),
    createJunkAnalysisCache(),
  ] as const;
  const oneEnabled = scoreByCandidate(
    scoreLegalActionsOnePlyAll(input.view, input.legalActions, DEFAULT_JUNK_WEIGHTS, caches[0]),
  );
  const oneDisabled = scoreByCandidate(
    scoreLegalActionsOnePlyAll(input.view, input.legalActions, withoutIsolation, caches[1]),
  );
  const twoEnabled = scoreByCandidate(
    scoreDiscardActionsTwoPlyAll(input.view, input.legalActions, DEFAULT_JUNK_WEIGHTS, caches[2]),
  );
  const twoDisabled = scoreByCandidate(
    scoreDiscardActionsTwoPlyAll(input.view, input.legalActions, withoutIsolation, caches[3]),
  );
  const structuralTwoById = new Map(
    structuralTwoPly.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const groups = new Map<string, string[]>();
  for (const candidate of structural.candidates) {
    const two = structuralTwoById.get(candidate.candidateId)!;
    const key = structuralKey(candidate, two);
    groups.set(key, [...(groups.get(key) ?? []), candidate.candidateId]);
  }

  const candidates = structural.candidates.map(({ candidateId, action }) => {
    const key = structuralKey(
      structural.candidates.find((candidate) => candidate.candidateId === candidateId)!,
      structuralTwoById.get(candidateId)!,
    );
    const peers = groups.get(key)!;
    const eligible = peers.length > 1;
    const oneEnabledScore = oneEnabled.get(candidateId)!;
    const oneDisabledScore = oneDisabled.get(candidateId)!;
    const twoEnabledScore = twoEnabled.get(candidateId)!;
    const twoDisabledScore = twoDisabled.get(candidateId)!;
    const metrics: MutableMetrics = {
      structurallyEquivalent: eligible,
      equivalentCandidateIds: eligible ? peers : [],
      onePlyWithIsolation: oneEnabledScore,
      onePlyWithoutIsolation: oneDisabledScore,
      onePlyIsolationDelta: oneEnabledScore - oneDisabledScore,
      twoPlyWithIsolation: twoEnabledScore,
      twoPlyWithoutIsolation: twoDisabledScore,
      twoPlyIsolationDelta: twoEnabledScore - twoDisabledScore,
      onePlyRankWithIsolation: eligible ? rankWithin(peers, oneEnabled, candidateId) : null,
      onePlyRankWithoutIsolation: eligible ? rankWithin(peers, oneDisabled, candidateId) : null,
      twoPlyRankWithIsolation: eligible ? rankWithin(peers, twoEnabled, candidateId) : null,
      twoPlyRankWithoutIsolation: eligible ? rankWithin(peers, twoDisabled, candidateId) : null,
    };
    return { candidateId, action, metrics };
  });

  return {
    scenarioId,
    evaluator: "isolation-boundary",
    evaluatorVersion: "v1",
    candidates,
    performance: {
      durationMs: performance.now() - startedAt,
      cacheHits: caches.reduce((total, cache) => total + cache.hits, 0),
      cacheMisses: caches.reduce((total, cache) => total + cache.misses, 0),
    },
    status: "ok",
  };
};
