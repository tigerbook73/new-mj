import {
  STANDARD_TILE_SET,
  createPrng,
  evaluateUkeireAfterDiscards,
  shuffle,
  tileIdOf,
  type TileId,
  type TileKind,
  type Meld,
} from "@new-mj/core";
import {
  DEFAULT_JUNK_WEIGHTS,
  probeSelfDrawTwoPly,
  scoreHandShapeAfterDiscard,
  type GameProgress,
  type JunkWeights,
  type SelfDrawTwoPlyProbe,
} from "./strategy.ts";

const ids = (kinds: readonly TileKind[]): TileId[] => {
  const copies = new Map<TileKind, number>();
  return kinds.map((kind) => {
    const copy = copies.get(kind) ?? 0;
    copies.set(kind, copy + 1);
    return tileIdOf(kind, copy);
  });
};

/** A representative 13-tile shape from the two-ply bridge fixture. Keeping
 * this fixture fixed makes profiles comparable across optimization attempts. */
export const BENCHMARK_INPUT = {
  hand: ids(["1p", "2p", "3p", "4p", "5p", "6p", "7s", "8s", "9s", "1z", "1z", "3m", "6m"]),
  melds: [],
} as const;

export const BENCHMARK_PROGRESS: GameProgress = { wallCount: 84, unseenPoolSize: 123 };

export type BenchmarkShape = Readonly<{
  hand: readonly TileId[];
  melds: readonly Meld[];
}>;

export type SelfDrawTwoPlyCandidate = Readonly<{
  discard: TileId;
  kind: TileKind;
  onePlyScore: number;
  twoPlyValue: number;
  probe: SelfDrawTwoPlyProbe;
}>;

export type SelfDrawTwoPlyCandidateEvaluation = Readonly<{
  candidateLimit: number;
  candidates: readonly SelfDrawTwoPlyCandidate[];
  onePlyBestKind: TileKind | undefined;
  onePlyBestValue: number | undefined;
  bestKind: TileKind | undefined;
  bestValue: number | undefined;
  elapsedMs: number;
}>;

type RankedDiscard = Readonly<{
  kind: TileKind;
  discard: TileId;
  rankScore: number;
  shanten: number;
}>;

const rankStructuralDiscards = (
  input: BenchmarkShape,
  visibleDiscards: readonly TileId[],
  candidateLimit: number,
): RankedDiscard[] => {
  const uniqueDiscards = new Map<TileKind, TileId>();
  for (const tile of input.hand) {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    if (!uniqueDiscards.has(kind)) uniqueDiscards.set(kind, tile);
  }
  const discardKinds = [...uniqueDiscards.keys()];
  const discardIndexes = discardKinds.map((kind) => STANDARD_TILE_SET.kindIndexOf(kind));
  const evaluations = evaluateUkeireAfterDiscards(
    input.hand,
    discardIndexes,
    { sevenPairs: input.melds.length === 0 },
    STANDARD_TILE_SET,
    input.melds.length,
  );
  const knownCounts = new Uint8Array(STANDARD_TILE_SET.kinds.length);
  for (const tile of [
    ...input.hand,
    ...input.melds.flatMap((meld) => meld.tiles),
    ...visibleDiscards,
  ]) {
    knownCounts[STANDARD_TILE_SET.kindIndexOf(STANDARD_TILE_SET.kindOf(tile))]! += 1;
  }
  const ranked = evaluations.map((evaluation, index) => {
    const discard = uniqueDiscards.get(discardKinds[index]!)!;
    let liveUkeire = 0;
    for (const kind of evaluation.improvingKinds) {
      const kindIndex = STANDARD_TILE_SET.kindIndexOf(kind);
      // The candidate is still known after it leaves the hand, so the input
      // hand count already represents the post-discard known total.
      liveUkeire += Math.max(0, STANDARD_TILE_SET.copiesPerKind - knownCounts[kindIndex]!);
    }
    return {
      kind: discardKinds[index]!,
      discard,
      rankScore: -evaluation.shanten * 1000 + liveUkeire,
      shanten: evaluation.shanten,
      liveUkeire,
    };
  });
  return ranked
    .sort((left, right) => right.rankScore - left.rankScore || right.liveUkeire - left.liveUkeire)
    .slice(0, Math.min(candidateLimit, ranked.length));
};

/** Cheap, diagnostic-only suit-trajectory bonus. It is intentionally not the
 * final fan evaluator: it rewards a post-discard hand whose dominant suit is
 * already ahead of its off-suit tiles, with honors contributing to a mixed
 * one-suit route. The divisor keeps the trajectory signal below a complete
 * fan's weight while still allowing a strong route to affect candidate order. */
export const suitTrajectoryBonusAfterDiscard = (
  input: BenchmarkShape,
  discard: TileId,
  weights: JunkWeights,
): number => {
  const hand = input.hand.filter((tile) => tile !== discard);
  const suitCounts = [0, 0, 0];
  let honorCount = 0;
  for (const tile of [...hand, ...input.melds.flatMap((meld) => meld.tiles)]) {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    if (kind.endsWith("z")) {
      honorCount += 1;
    } else {
      suitCounts[kind[1] === "m" ? 0 : kind[1] === "p" ? 1 : 2]! += 1;
    }
  }
  const suitedCount = suitCounts.reduce((sum, count) => sum + count, 0);
  if (suitedCount === 0) return 0;
  const dominantSuitCount = Math.max(...suitCounts);
  const offSuitCount = suitedCount - dominantSuitCount;
  if (dominantSuitCount < 8 || dominantSuitCount <= offSuitCount) return 0;
  const routeSignal = Math.max(
    0,
    (honorCount > 0 ? dominantSuitCount + honorCount : dominantSuitCount) - offSuitCount - 1,
  );
  const routeWeight = honorCount > 0 ? weights.hunyise : weights.qingyise;
  return (routeSignal * routeWeight) / 8;
};

const rankWeightedTrajectoryDiscards = (
  input: BenchmarkShape,
  visibleDiscards: readonly TileId[],
  weights: JunkWeights,
  gameProgress: GameProgress,
  candidateLimit: number,
): RankedDiscard[] => {
  const uniqueDiscards = new Map<TileKind, TileId>();
  for (const tile of input.hand) {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    if (!uniqueDiscards.has(kind)) uniqueDiscards.set(kind, tile);
  }
  return [...uniqueDiscards.entries()]
    .map(([kind, discard]) => ({
      kind,
      discard,
      rankScore:
        scoreHandShapeAfterDiscard(input, discard, visibleDiscards, weights, undefined, gameProgress) +
        suitTrajectoryBonusAfterDiscard(input, discard, weights),
      shanten: 0,
    }))
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, Math.min(candidateLimit, uniqueDiscards.size));
};

const evaluateRankedCandidates = (
  input: BenchmarkShape,
  ranked: readonly RankedDiscard[],
  visibleDiscards: readonly TileId[],
  weights: JunkWeights,
  gameProgress: GameProgress,
  candidateLimit: number,
): SelfDrawTwoPlyCandidateEvaluation => {
  const startedAt = performance.now();
  const candidates = ranked.slice(0, candidateLimit).map(({ kind, discard, rankScore }) => {
    const afterDiscard = {
      hand: input.hand.filter((tile) => tile !== discard),
      melds: input.melds,
    };
    const probe = probeSelfDrawTwoPly(
      afterDiscard,
      [...visibleDiscards, discard],
      weights,
      gameProgress,
    );
    return {
      discard,
      kind,
      onePlyScore: rankScore,
      twoPlyValue: probe.continuationValue + probe.winProbability,
      probe,
    };
  });
  const best = candidates.reduce<SelfDrawTwoPlyCandidate | undefined>(
    (current, candidate) =>
      current === undefined || candidate.twoPlyValue > current.twoPlyValue ? candidate : current,
    undefined,
  );
  return {
    candidateLimit,
    candidates,
    onePlyBestKind: ranked[0]?.kind,
    onePlyBestValue: ranked[0]?.rankScore,
    bestKind: best?.kind,
    bestValue: best?.twoPlyValue,
    elapsedMs: performance.now() - startedAt,
  };
};

export const evaluateStructuralTwoPlyCandidates = (
  input: BenchmarkShape,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  gameProgress: GameProgress = BENCHMARK_PROGRESS,
  candidateLimit = Number.POSITIVE_INFINITY,
): SelfDrawTwoPlyCandidateEvaluation => {
  if (!(candidateLimit > 0)) throw new Error("candidateLimit must be positive");
  const startedAt = performance.now();
  const ranked = rankStructuralDiscards(input, visibleDiscards, candidateLimit);
  const result = evaluateRankedCandidates(
    input,
    ranked,
    visibleDiscards,
    weights,
    gameProgress,
    candidateLimit,
  );
  return { ...result, elapsedMs: performance.now() - startedAt };
};

/** Diagnostic candidate evaluator using the cheap weighted suit trajectory. */
export const evaluateWeightedTrajectoryTwoPlyCandidates = (
  input: BenchmarkShape,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  gameProgress: GameProgress = BENCHMARK_PROGRESS,
  candidateLimit = Number.POSITIVE_INFINITY,
): SelfDrawTwoPlyCandidateEvaluation => {
  if (!(candidateLimit > 0)) throw new Error("candidateLimit must be positive");
  const startedAt = performance.now();
  const ranked = rankWeightedTrajectoryDiscards(
    input,
    visibleDiscards,
    weights,
    gameProgress,
    candidateLimit,
  );
  const result = evaluateRankedCandidates(
    input,
    ranked,
    visibleDiscards,
    weights,
    gameProgress,
    candidateLimit,
  );
  return { ...result, elapsedMs: performance.now() - startedAt };
};

export type DynamicWeightedTrajectoryConfig = Readonly<{
  minN: number;
  maxN: number;
  scoreWindow: number;
  elbowGap: number;
}>;

export const DEFAULT_DYNAMIC_TRAJECTORY_CONFIG: DynamicWeightedTrajectoryConfig = {
  minN: 2,
  maxN: 4,
  scoreWindow: 4,
  elbowGap: 12,
};

export const chooseDynamicTrajectoryLimit = (
  ranked: readonly RankedDiscard[],
  config: DynamicWeightedTrajectoryConfig,
): number => {
  if (
    !Number.isSafeInteger(config.minN) ||
    !Number.isSafeInteger(config.maxN) ||
    config.minN <= 0 ||
    config.maxN < config.minN ||
    config.scoreWindow < 0 ||
    config.elbowGap < 0
  )
    throw new Error("invalid dynamic trajectory config");
  const lower = Math.min(config.minN, ranked.length);
  const upper = Math.min(config.maxN, ranked.length);
  if (lower === 0) return 0;
  let limit = lower;
  const bestScore = ranked[0]!.rankScore;
  while (limit < upper && ranked[limit]!.rankScore >= bestScore - config.scoreWindow) limit += 1;
  for (let index = lower; index < limit; index += 1) {
    if (ranked[index - 1]!.rankScore - ranked[index]!.rankScore >= config.elbowGap) {
      return index;
    }
  }
  return limit;
};

/** Diagnostic dynamic-N evaluator with explicit minimum and maximum budgets. */
export const evaluateDynamicWeightedTrajectoryCandidates = (
  input: BenchmarkShape,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  gameProgress: GameProgress = BENCHMARK_PROGRESS,
  config: DynamicWeightedTrajectoryConfig = DEFAULT_DYNAMIC_TRAJECTORY_CONFIG,
): SelfDrawTwoPlyCandidateEvaluation => {
  const startedAt = performance.now();
  const ranked = rankWeightedTrajectoryDiscards(
    input,
    visibleDiscards,
    weights,
    gameProgress,
    Number.POSITIVE_INFINITY,
  );
  const candidateLimit = chooseDynamicTrajectoryLimit(ranked, config);
  const result = evaluateRankedCandidates(
    input,
    ranked.slice(0, candidateLimit),
    visibleDiscards,
    weights,
    gameProgress,
    candidateLimit,
  );
  return { ...result, elapsedMs: performance.now() - startedAt };
};

export const evaluateConservativeStructuralCandidates = (
  input: BenchmarkShape,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  gameProgress: GameProgress = BENCHMARK_PROGRESS,
): SelfDrawTwoPlyCandidateEvaluation => {
  const ranked = rankStructuralDiscards(input, visibleDiscards, Number.POSITIVE_INFINITY);
  const minShanten = Math.min(...ranked.map(({ shanten }) => shanten));
  return evaluateRankedCandidates(
    input,
    ranked.filter(({ shanten }) => shanten === minShanten),
    visibleDiscards,
    weights,
    gameProgress,
    Number.POSITIVE_INFINITY,
  );
};

export type ConservativeStructuralSuite = Readonly<{
  iterations: number;
  fixtureCount: number;
  averageCandidates: number;
  elapsedMs: number;
  msPerCase: number;
  winnerAgreement: number;
  meanScoreGap: number;
}>;

/** Keeps only discards with the minimum post-discard shanten before 2-ply. */
export const benchmarkConservativeStructuralSuite = (
  iterations: number,
  fixtureCount = 8,
): ConservativeStructuralSuite => {
  if (!Number.isSafeInteger(iterations) || iterations <= 0)
    throw new Error("iterations must be a positive safe integer");
  const inputs = benchmarkInputs(fixtureCount);
  let elapsedMs = 0;
  let candidates = 0;
  let agreement = 0;
  let scoreGap = 0;
  let cases = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const input of inputs) {
      const full = evaluateSelfDrawTwoPlyCandidates(
        input,
        [],
        DEFAULT_JUNK_WEIGHTS,
        BENCHMARK_PROGRESS,
        Number.POSITIVE_INFINITY,
      );
      const startedAt = performance.now();
      const bounded = evaluateConservativeStructuralCandidates(
        input,
        [],
        DEFAULT_JUNK_WEIGHTS,
        BENCHMARK_PROGRESS,
      );
      elapsedMs += performance.now() - startedAt;
      candidates += bounded.candidates.length;
      if (bounded.bestKind === full.bestKind) agreement += 1;
      scoreGap += (full.bestValue ?? 0) - (bounded.bestValue ?? 0);
      cases += 1;
    }
  }
  return {
    iterations,
    fixtureCount: inputs.length,
    averageCandidates: candidates / cases,
    elapsedMs,
    msPerCase: elapsedMs / cases,
    winnerAgreement: agreement / cases,
    meanScoreGap: scoreGap / cases,
  };
};

/**
 * Evaluates a bounded number of discard candidates for the diagnostic 2-ply
 * probe. Candidates are ranked by the existing 1-ply score; this is an
 * experiment only and is deliberately not called by the default policy.
 */
export const evaluateSelfDrawTwoPlyCandidates = (
  input: BenchmarkShape,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  gameProgress: GameProgress = BENCHMARK_PROGRESS,
  candidateLimit = Number.POSITIVE_INFINITY,
): SelfDrawTwoPlyCandidateEvaluation => {
  if (!(candidateLimit > 0)) throw new Error("candidateLimit must be positive");
  const startedAt = performance.now();
  const uniqueDiscards = new Map<TileKind, TileId>();
  for (const tile of input.hand) {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    if (!uniqueDiscards.has(kind)) uniqueDiscards.set(kind, tile);
  }
  const ranked = [...uniqueDiscards.entries()]
    .map(([kind, discard]) => ({
      kind,
      discard,
      onePlyScore: scoreHandShapeAfterDiscard(
        input,
        discard,
        visibleDiscards,
        weights,
        undefined,
        gameProgress,
      ),
    }))
    .sort((left, right) => right.onePlyScore - left.onePlyScore)
    .slice(0, Math.min(candidateLimit, uniqueDiscards.size));
  const candidates = ranked.map(({ kind, discard, onePlyScore }) => {
    const afterDiscard = {
      hand: input.hand.filter((tile) => tile !== discard),
      melds: input.melds,
    };
    const probe = probeSelfDrawTwoPly(
      afterDiscard,
      [...visibleDiscards, discard],
      weights,
      gameProgress,
    );
    return {
      discard,
      kind,
      onePlyScore,
      twoPlyValue: probe.continuationValue + probe.winProbability,
      probe,
    };
  });
  const best = candidates.reduce<SelfDrawTwoPlyCandidate | undefined>(
    (current, candidate) =>
      current === undefined || candidate.twoPlyValue > current.twoPlyValue ? candidate : current,
    undefined,
  );
  return {
    candidateLimit,
    candidates,
    onePlyBestKind: ranked[0]?.kind,
    onePlyBestValue: ranked[0]?.onePlyScore,
    bestKind: best?.kind,
    bestValue: best?.twoPlyValue,
    elapsedMs: performance.now() - startedAt,
  };
};

const allPhysicalTiles = (): TileId[] =>
  STANDARD_TILE_SET.kinds.flatMap((kind) =>
    Array.from({ length: STANDARD_TILE_SET.copiesPerKind }, (_, copy) => tileIdOf(kind, copy)),
  );

/** Deterministic random-hand suite for candidate-budget A/B measurements. */
export const benchmarkInputs = (count: number, seed = 0x2f_2a1e): BenchmarkShape[] => {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("count must be positive");
  const tiles = allPhysicalTiles();
  return Array.from({ length: count }, (_, index) => ({
    hand: shuffle(tiles, createPrng(seed + index)).items.slice(0, 13),
    melds: [],
  }));
};

export type SelfDrawTwoPlyCandidateSuite = Readonly<{
  iterations: number;
  fixtureCount: number;
  results: readonly Readonly<{
    candidateLimit: number | "all";
    elapsedMs: number;
    msPerCase: number;
    winnerAgreement: number;
    meanScoreGap: number;
  }>[];
  onePly: Readonly<{
    winnerAgreement: number;
    meanScoreGap: number;
  }>;
}>;

export type TieredTwoPlyCandidateSuite = Readonly<{
  iterations: number;
  fixtureCount: number;
  results: readonly Readonly<{
    threshold: number;
    fallbackRate: number;
    winnerAgreement: number;
    meanScoreGap: number;
    estimatedMsPerCase: number;
  }>[];
}>;

/** Evaluates a Top-2-first policy that expands to all candidates when its two
 * best 2-ply values are too close to trust the bounded result. */
export const benchmarkTieredTwoPlyCandidateSuite = (
  iterations: number,
  thresholds: readonly number[] = [0, 0.5, 1, 2, 5, 10],
  fixtureCount = 8,
): TieredTwoPlyCandidateSuite => {
  if (!Number.isSafeInteger(iterations) || iterations <= 0)
    throw new Error("iterations must be a positive safe integer");
  const inputs = benchmarkInputs(fixtureCount);
  const totals = thresholds.map(() => ({
    fallback: 0,
    agreement: 0,
    scoreGap: 0,
    elapsedMs: 0,
  }));
  let cases = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const input of inputs) {
      const full = evaluateSelfDrawTwoPlyCandidates(
        input,
        [],
        DEFAULT_JUNK_WEIGHTS,
        BENCHMARK_PROGRESS,
        Number.POSITIVE_INFINITY,
      );
      const topTwo = evaluateSelfDrawTwoPlyCandidates(
        input,
        [],
        DEFAULT_JUNK_WEIGHTS,
        BENCHMARK_PROGRESS,
        2,
      );
      const first = topTwo.candidates[0];
      const second = topTwo.candidates[1];
      const margin = first && second ? first.twoPlyValue - second.twoPlyValue : Infinity;
      for (const [index, threshold] of thresholds.entries()) {
        const fallback = margin <= threshold;
        const selected = fallback ? full : topTwo;
        totals[index]!.fallback += fallback ? 1 : 0;
        totals[index]!.agreement += selected.bestKind === full.bestKind ? 1 : 0;
        totals[index]!.scoreGap += (full.bestValue ?? 0) - (selected.bestValue ?? 0);
        totals[index]!.elapsedMs += topTwo.elapsedMs + (fallback ? full.elapsedMs : 0);
      }
      cases += 1;
    }
  }
  return {
    iterations,
    fixtureCount: inputs.length,
    results: thresholds.map((threshold, index) => ({
      threshold,
      fallbackRate: totals[index]!.fallback / cases,
      winnerAgreement: totals[index]!.agreement / cases,
      meanScoreGap: totals[index]!.scoreGap / cases,
      estimatedMsPerCase: totals[index]!.elapsedMs / cases,
    })),
  };
};

/** Compares bounded candidate budgets with the full diagnostic probe suite. */
export const benchmarkSelfDrawTwoPlyCandidateSuite = (
  iterations: number,
  candidateLimits: readonly number[] = [1, 2, 3, 4, 5, Number.POSITIVE_INFINITY],
  fixtureCount = 8,
): SelfDrawTwoPlyCandidateSuite => {
  if (!Number.isSafeInteger(iterations) || iterations <= 0)
    throw new Error("iterations must be a positive safe integer");
  const inputs = benchmarkInputs(fixtureCount);
  const totals = candidateLimits.map(() => ({ elapsedMs: 0, agreement: 0, scoreGap: 0 }));
  const onePly = { agreement: 0, scoreGap: 0 };
  let cases = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const input of inputs) {
      const full = evaluateSelfDrawTwoPlyCandidates(
        input,
        [],
        DEFAULT_JUNK_WEIGHTS,
        BENCHMARK_PROGRESS,
        Number.POSITIVE_INFINITY,
      );
      if (full.onePlyBestKind === full.bestKind) onePly.agreement += 1;
      const onePlyCandidate = full.candidates.find(
        (candidate) => candidate.kind === full.onePlyBestKind,
      );
      onePly.scoreGap += (full.bestValue ?? 0) - (onePlyCandidate?.twoPlyValue ?? 0);
      for (const [index, candidateLimit] of candidateLimits.entries()) {
        const bounded = evaluateSelfDrawTwoPlyCandidates(
          input,
          [],
          DEFAULT_JUNK_WEIGHTS,
          BENCHMARK_PROGRESS,
          candidateLimit,
        );
        totals[index]!.elapsedMs += bounded.elapsedMs;
        if (bounded.bestKind === full.bestKind) totals[index]!.agreement += 1;
        totals[index]!.scoreGap += (full.bestValue ?? 0) - (bounded.bestValue ?? 0);
      }
      cases += 1;
    }
  }
  return {
    iterations,
    fixtureCount: inputs.length,
    onePly: {
      winnerAgreement: onePly.agreement / cases,
      meanScoreGap: onePly.scoreGap / cases,
    },
    results: candidateLimits.map((candidateLimit, index) => ({
      candidateLimit: Number.isFinite(candidateLimit) ? candidateLimit : "all",
      elapsedMs: totals[index]!.elapsedMs,
      msPerCase: totals[index]!.elapsedMs / cases,
      winnerAgreement: totals[index]!.agreement / cases,
      meanScoreGap: totals[index]!.scoreGap / cases,
    })),
  };
};

/** Compares the structural shanten/ukeire ranking with the existing 1-ply ranking. */
export const benchmarkStructuralTwoPlyCandidateSuite = (
  iterations: number,
  candidateLimits: readonly number[] = [1, 2, 3, 4, 5, Number.POSITIVE_INFINITY],
  fixtureCount = 8,
): SelfDrawTwoPlyCandidateSuite => {
  if (!Number.isSafeInteger(iterations) || iterations <= 0)
    throw new Error("iterations must be a positive safe integer");
  const inputs = benchmarkInputs(fixtureCount);
  const totals = candidateLimits.map(() => ({ elapsedMs: 0, agreement: 0, scoreGap: 0 }));
  let cases = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const input of inputs) {
      const full = evaluateSelfDrawTwoPlyCandidates(
        input,
        [],
        DEFAULT_JUNK_WEIGHTS,
        BENCHMARK_PROGRESS,
        Number.POSITIVE_INFINITY,
      );
      for (const [index, candidateLimit] of candidateLimits.entries()) {
        const bounded = evaluateStructuralTwoPlyCandidates(
          input,
          [],
          DEFAULT_JUNK_WEIGHTS,
          BENCHMARK_PROGRESS,
          candidateLimit,
        );
        totals[index]!.elapsedMs += bounded.elapsedMs;
        if (bounded.bestKind === full.bestKind) totals[index]!.agreement += 1;
        totals[index]!.scoreGap += (full.bestValue ?? 0) - (bounded.bestValue ?? 0);
      }
      cases += 1;
    }
  }
  return {
    iterations,
    fixtureCount: inputs.length,
    onePly: {
      winnerAgreement: 0,
      meanScoreGap: 0,
    },
    results: candidateLimits.map((candidateLimit, index) => ({
      candidateLimit: Number.isFinite(candidateLimit) ? candidateLimit : "all",
      elapsedMs: totals[index]!.elapsedMs,
      msPerCase: totals[index]!.elapsedMs / cases,
      winnerAgreement: totals[index]!.agreement / cases,
      meanScoreGap: totals[index]!.scoreGap / cases,
    })),
  };
};

/** Compares the cheap weighted suit-trajectory ranking with the full probe. */
export const benchmarkWeightedTrajectoryTwoPlyCandidateSuite = (
  iterations: number,
  candidateLimits: readonly number[] = [1, 2, 3, 4, 5, Number.POSITIVE_INFINITY],
  fixtureCount = 8,
): SelfDrawTwoPlyCandidateSuite => {
  if (!Number.isSafeInteger(iterations) || iterations <= 0)
    throw new Error("iterations must be a positive safe integer");
  const inputs = benchmarkInputs(fixtureCount);
  const totals = candidateLimits.map(() => ({ elapsedMs: 0, agreement: 0, scoreGap: 0 }));
  let cases = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const input of inputs) {
      const full = evaluateSelfDrawTwoPlyCandidates(
        input,
        [],
        DEFAULT_JUNK_WEIGHTS,
        BENCHMARK_PROGRESS,
        Number.POSITIVE_INFINITY,
      );
      for (const [index, candidateLimit] of candidateLimits.entries()) {
        const bounded = evaluateWeightedTrajectoryTwoPlyCandidates(
          input,
          [],
          DEFAULT_JUNK_WEIGHTS,
          BENCHMARK_PROGRESS,
          candidateLimit,
        );
        totals[index]!.elapsedMs += bounded.elapsedMs;
        if (bounded.bestKind === full.bestKind) totals[index]!.agreement += 1;
        totals[index]!.scoreGap += (full.bestValue ?? 0) - (bounded.bestValue ?? 0);
      }
      cases += 1;
    }
  }
  return {
    iterations,
    fixtureCount: inputs.length,
    onePly: { winnerAgreement: 0, meanScoreGap: 0 },
    results: candidateLimits.map((candidateLimit, index) => ({
      candidateLimit: Number.isFinite(candidateLimit) ? candidateLimit : "all",
      elapsedMs: totals[index]!.elapsedMs,
      msPerCase: totals[index]!.elapsedMs / cases,
      winnerAgreement: totals[index]!.agreement / cases,
      meanScoreGap: totals[index]!.scoreGap / cases,
    })),
  };
};

export type DynamicWeightedTrajectorySuite = Readonly<{
  iterations: number;
  fixtureCount: number;
  config: DynamicWeightedTrajectoryConfig;
  averageCandidates: number;
  elapsedMs: number;
  msPerCase: number;
  winnerAgreement: number;
  meanScoreGap: number;
}>;

export const benchmarkDynamicWeightedTrajectorySuite = (
  iterations: number,
  config: DynamicWeightedTrajectoryConfig = DEFAULT_DYNAMIC_TRAJECTORY_CONFIG,
  fixtureCount = 8,
): DynamicWeightedTrajectorySuite => {
  if (!Number.isSafeInteger(iterations) || iterations <= 0)
    throw new Error("iterations must be a positive safe integer");
  const inputs = benchmarkInputs(fixtureCount);
  let candidates = 0;
  let elapsedMs = 0;
  let agreement = 0;
  let scoreGap = 0;
  let cases = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const input of inputs) {
      const full = evaluateSelfDrawTwoPlyCandidates(
        input,
        [],
        DEFAULT_JUNK_WEIGHTS,
        BENCHMARK_PROGRESS,
        Number.POSITIVE_INFINITY,
      );
      const dynamic = evaluateDynamicWeightedTrajectoryCandidates(
        input,
        [],
        DEFAULT_JUNK_WEIGHTS,
        BENCHMARK_PROGRESS,
        config,
      );
      candidates += dynamic.candidates.length;
      elapsedMs += dynamic.elapsedMs;
      if (dynamic.bestKind === full.bestKind) agreement += 1;
      scoreGap += (full.bestValue ?? 0) - (dynamic.bestValue ?? 0);
      cases += 1;
    }
  }
  return {
    iterations,
    fixtureCount: inputs.length,
    config,
    averageCandidates: candidates / cases,
    elapsedMs,
    msPerCase: elapsedMs / cases,
    winnerAgreement: agreement / cases,
    meanScoreGap: scoreGap / cases,
  };
};

export type SelfDrawTwoPlyBenchmark = Readonly<{
  iterations: number;
  elapsedMs: number;
  msPerProbe: number;
  /** Stops an optimizing compiler from treating repeated calls as unused and
   * provides a stable sanity check for the benchmark fixture. */
  checksum: number;
}>;

/** Runs the fixed Phase-2 diagnostic probe repeatedly, outside Vitest/Vite, so
 * `node --cpu-prof` can attribute samples to the actual decision path. */
export const benchmarkSelfDrawTwoPly = (iterations: number): SelfDrawTwoPlyBenchmark => {
  if (!Number.isSafeInteger(iterations) || iterations <= 0)
    throw new Error("iterations must be a positive safe integer");

  const startedAt = performance.now();
  let checksum = 0;
  for (let index = 0; index < iterations; index += 1) {
    const probe: SelfDrawTwoPlyProbe = probeSelfDrawTwoPly(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
    );
    checksum += probe.continuationValue + probe.winProbability + probe.continuationProbability;
  }
  const elapsedMs = performance.now() - startedAt;
  return { iterations, elapsedMs, msPerProbe: elapsedMs / iterations, checksum };
};
