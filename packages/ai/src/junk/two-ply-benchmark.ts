import {
  STANDARD_TILE_SET,
  createPrng,
  shuffle,
  tileIdOf,
  type TileId,
  type TileKind,
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

type BenchmarkShape = Readonly<{
  hand: readonly TileId[];
  melds: readonly [];
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
    const probe = probeSelfDrawTwoPly(afterDiscard, visibleDiscards, weights, gameProgress);
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

/** Compares bounded candidate budgets with the full diagnostic probe suite. */
export const benchmarkSelfDrawTwoPlyCandidateSuite = (
  iterations: number,
  candidateLimits: readonly number[] = [1, 2, 3, Number.POSITIVE_INFINITY],
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
