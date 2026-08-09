import { describe, expect, it } from "vitest";
import { tileIdOf } from "@new-mj/core";
import {
  BENCHMARK_INPUT,
  BENCHMARK_PROGRESS,
  benchmarkSelfDrawTwoPly,
  evaluateSelfDrawTwoPlyCandidates,
  benchmarkConservativeStructuralSuite,
  evaluateStructuralTwoPlyCandidates,
  evaluateWeightedTrajectoryTwoPlyCandidates,
  evaluateDynamicWeightedTrajectoryCandidates,
  evaluateWeightedTrajectoryWithSharedCache,
  benchmarkCrossCandidateDrawOverlap,
  benchmarkSecondDiscardWhitelistSuite,
  benchmarkDynamicSecondDiscardWhitelistSuite,
  benchmarkTwoChangeBatchSuite,
  benchmarkCoreBatchTwoPlySuite,
  chooseDynamicTrajectoryLimit,
  DEFAULT_DYNAMIC_TRAJECTORY_CONFIG,
  suitTrajectoryBonusAfterDiscard,
} from "./two-ply-benchmark.ts";
import { DEFAULT_JUNK_WEIGHTS } from "./strategy.ts";

describe("benchmarkSelfDrawTwoPly", () => {
  it("keeps a strong pure-suit route in the weighted trajectory shortlist", () => {
    const copies = new Map<string, number>();
    const hand = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "5z", "7z"].map(
      (kind) => {
        const copy = copies.get(kind) ?? 0;
        copies.set(kind, copy + 1);
        return tileIdOf(kind as Parameters<typeof tileIdOf>[0], copy);
      },
    );
    const input = { hand, melds: [] } as const;
    const stressWeights = {
      ...DEFAULT_JUNK_WEIGHTS,
      shantenWeight: 10,
      qingyise: 160,
      hunyise: 160,
    };
    expect(suitTrajectoryBonusAfterDiscard(input, hand[9]!, stressWeights)).toBeGreaterThan(0);
    const full = evaluateSelfDrawTwoPlyCandidates(
      input,
      [],
      stressWeights,
      BENCHMARK_PROGRESS,
      Number.POSITIVE_INFINITY,
    );
    const bounded = evaluateWeightedTrajectoryTwoPlyCandidates(
      input,
      [],
      stressWeights,
      BENCHMARK_PROGRESS,
      4,
    );
    expect(full.bestKind).toBe("1p");
    expect(bounded.bestKind).toBe(full.bestKind);
  });

  it("bounds dynamic trajectory candidate selection", () => {
    const result = evaluateDynamicWeightedTrajectoryCandidates(
      BENCHMARK_INPUT,
      [],
      DEFAULT_JUNK_WEIGHTS,
      BENCHMARK_PROGRESS,
      DEFAULT_DYNAMIC_TRAJECTORY_CONFIG,
    );
    expect(result.candidates.length).toBeLessThanOrEqual(
      DEFAULT_DYNAMIC_TRAJECTORY_CONFIG.maxN,
    );
    expect(chooseDynamicTrajectoryLimit([], DEFAULT_DYNAMIC_TRAJECTORY_CONFIG)).toBe(0);
  });

  it("shares only pure structure results without changing the two-ply winner", () => {
    const full = evaluateSelfDrawTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      DEFAULT_JUNK_WEIGHTS,
      BENCHMARK_PROGRESS,
      Number.POSITIVE_INFINITY,
    );
    const shared = evaluateWeightedTrajectoryWithSharedCache(
      BENCHMARK_INPUT,
      [],
      DEFAULT_JUNK_WEIGHTS,
      BENCHMARK_PROGRESS,
      4,
    );
    expect(shared.evaluation.bestKind).toBe(full.bestKind);
    expect(shared.cacheHits).toBeGreaterThan(0);
    expect(shared.cacheMisses).toBeGreaterThan(shared.cacheHits);
  });

  it("measures cross-candidate draw-state overlap", () => {
    const result = benchmarkCrossCandidateDrawOverlap(1, 4, 2);
    expect(result.averageDrawStates).toBeGreaterThan(result.averageUniqueDrawStates);
    expect(result.overlapRate).toBeGreaterThanOrEqual(0);
    expect(result.overlapRate).toBeLessThan(1);
  });

  it("keeps the newly drawn kind in the second-discard whitelist", () => {
    const result = benchmarkSecondDiscardWhitelistSuite(1, 4, 4, 2);
    expect(result.averageSecondDiscardCandidates).toBeGreaterThan(0);
    expect(result.averageSecondDiscardCandidates).toBeLessThan(14);
    expect(result.winnerAgreement).toBeGreaterThanOrEqual(0);
    expect(result.winnerAgreement).toBeLessThanOrEqual(1);
  });

  it("expands the second-discard whitelist on a flat score curve", () => {
    const result = benchmarkDynamicSecondDiscardWhitelistSuite(1, 4, undefined, 2);
    expect(result.averageSecondDiscardCandidates).toBeGreaterThan(0);
    expect(result.winnerAgreement).toBeGreaterThanOrEqual(0);
    expect(result.winnerAgreement).toBeLessThanOrEqual(1);
  });

  it("keeps the core two-change matrix equivalent to the existing batch path", () => {
    const result = benchmarkTwoChangeBatchSuite(1, 2, 2);
    expect(result.comparisons).toBeGreaterThan(0);
    expect(result.mismatches).toBe(0);
    expect(result.twoChangeMsPerCase).toBeGreaterThan(0);
  });

  it("keeps the complete dynamic probe equivalent with the core batch path", () => {
    const result = benchmarkCoreBatchTwoPlySuite(1, 2, 2);
    expect(result.winnerAgreement).toBe(1);
    expect(result.meanScoreGap).toBe(0);
    expect(result.coreBatchMsPerCase).toBeGreaterThan(0);
  });

  it("runs the fixed probe and rejects invalid iteration counts", { tags: ["slow"] }, () => {
    const result = benchmarkSelfDrawTwoPly(1);
    expect(result.iterations).toBe(1);
    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(result.msPerProbe).toBe(result.elapsedMs);
    expect(Number.isFinite(result.checksum)).toBe(true);
    expect(() => benchmarkSelfDrawTwoPly(0)).toThrow("positive safe integer");
  });

  it("bounds candidate evaluation without changing the full-fixture winner", () => {
    const topOne = evaluateSelfDrawTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
      1,
    );
    const full = evaluateSelfDrawTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
    );
    expect(topOne.candidates).toHaveLength(1);
    expect(full.candidates.length).toBeGreaterThan(topOne.candidates.length);
    expect(topOne.bestKind).toBe(full.bestKind);
  });

  it("removes the candidate discard from the next-draw probability pool", () => {
    const result = evaluateSelfDrawTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
      Number.POSITIVE_INFINITY,
    );
    const threeMeters = result.candidates.find((candidate) => candidate.kind === "3m");
    expect(threeMeters?.probe.outcomes.find(({ kind }) => kind === "3m")?.probability).toBe(
      3 / BENCHMARK_PROGRESS.unseenPoolSize,
    );
  });

  it("ranks structural candidates from core shanten and live ukeire", () => {
    const result = evaluateStructuralTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
      2,
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every(({ onePlyScore }) => Number.isFinite(onePlyScore))).toBe(true);
  });

  it("can keep only the minimum post-discard shanten layer", () => {
    const result = benchmarkConservativeStructuralSuite(1, 2);
    expect(result.averageCandidates).toBeGreaterThan(0);
    expect(result.averageCandidates).toBeLessThan(BENCHMARK_INPUT.hand.length);
    expect(Number.isFinite(result.msPerCase)).toBe(true);
  });
});
