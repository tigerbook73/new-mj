import { createPrng, nextUint32, SEAT_IDS, type SeatId } from "@new-mj/core";
import { playJunkMatch, strengthPolicy, type SeatPolicy } from "./arena.ts";
import { DEFAULT_JUNK_WEIGHTS, type JunkWeights } from "./strategy.ts";

const WEIGHT_KEYS = Object.keys(DEFAULT_JUNK_WEIGHTS) as (keyof JunkWeights)[];

/** Deterministic [0, 1) generator, same primitive used across this package's
 * reproducible-randomness spots (see JunkStrengthConfig.random). */
const seededRandom = (seed: number): (() => number) => {
  let prng = createPrng(seed);
  return () => {
    const step = nextUint32(prng);
    prng = step.prng;
    return step.value / 0x1_0000_0000;
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Box-Muller: one standard-normal sample from two independent uniform(0,1) draws. */
const gaussian = (random: () => number): number => {
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

/**
 * Log-normal multiplicative mutation: every weight moves by roughly the same
 * *relative* percentage regardless of its absolute scale (shantenWeight ~100 vs
 * pairBonus ~2) — a single additive step size would let the largest-magnitude
 * weight dominate every mutation. Clamped to keep pathological drift finite.
 */
const mutate = (weights: JunkWeights, sigma: number, random: () => number): JunkWeights => {
  const mutated = { ...weights };
  for (const key of WEIGHT_KEYS) {
    mutated[key] = clamp(mutated[key] * Math.exp(sigma * gaussian(random)), 0.01, 10_000);
  }
  return mutated;
};

/** Which two seats play the candidate weights for a given duplicate-deal pass;
 * the same seed is replayed once per split so seat-position effects cancel out
 * instead of biasing the comparison. */
const CANDIDATE_SEAT_SPLITS: readonly SeatId[][] = [
  [0, 2],
  [1, 3],
];

export type MatchupResult = {
  candidateScore: number;
  baselineScore: number;
  candidateWins: number;
  totalMatches: number;
};

/**
 * Compares two weight sets by self-play: for every seed, both seat splits are
 * played (same wall/deal, candidate/baseline seats swapped) so deal-luck and
 * seat-position effects cancel out across the pair — a lightweight version of
 * duplicate-deal comparison, not literal single-hand replay (a 4-seat game has
 * no notion of "the same hand" for two independent policies at once).
 */
export const evaluateCandidate = (
  seeds: readonly number[],
  baseline: JunkWeights,
  candidate: JunkWeights,
): MatchupResult => {
  let candidateScore = 0;
  let baselineScore = 0;
  let candidateWins = 0;
  let totalMatches = 0;
  for (const seed of seeds) {
    for (const candidateSeats of CANDIDATE_SEAT_SPLITS) {
      const policies = SEAT_IDS.map((seat) =>
        candidateSeats.includes(seat) ? strengthPolicy({}, candidate) : strengthPolicy({}, baseline),
      ) as [SeatPolicy, SeatPolicy, SeatPolicy, SeatPolicy];
      const result = playJunkMatch(seed, policies);
      if ("error" in result) continue;
      totalMatches += 1;
      const candidateTotal = candidateSeats.reduce<number>(
        (sum, seat) => sum + result.scores[seat],
        0,
      );
      const baselineTotal = result.scores.reduce((sum, score) => sum + score, 0) - candidateTotal;
      candidateScore += candidateTotal;
      baselineScore += baselineTotal;
      if (candidateTotal > baselineTotal) candidateWins += 1;
    }
  }
  return { candidateScore, baselineScore, candidateWins, totalMatches };
};

export type TuneGenerationLog = {
  generation: number;
  sigma: number;
  accepted: boolean;
  candidateScore: number;
  incumbentScore: number;
  matches: number;
};

export type TuneReport = {
  seed: number;
  generations: TuneGenerationLog[];
  baselineWeights: JunkWeights;
  tunedWeights: JunkWeights;
};

export type TuneOptions = {
  generations: number;
  seedsPerGeneration: number;
  initialSigma?: number;
};

const SUCCESS_WINDOW = 10;
const TARGET_SUCCESS_RATE = 0.2; // Rechenberg's 1/5 rule

/**
 * (1+1) evolution strategy with the 1/5 success rule: each generation mutates the
 * current incumbent once, keeps the mutant only if it beats the incumbent in
 * self-play (see evaluateCandidate), and adjusts the mutation step size to track
 * a ~20% acceptance rate — widen the search while succeeding often, narrow it
 * while mostly failing. No external optimization library; see AGENTS.md for why.
 */
export const tuneJunkWeights = (seed: number, options: TuneOptions): TuneReport => {
  const { generations, seedsPerGeneration, initialSigma = 0.15 } = options;
  let incumbent = DEFAULT_JUNK_WEIGHTS;
  let sigma = initialSigma;
  let prng = createPrng(seed);
  const logs: TuneGenerationLog[] = [];
  const recentOutcomes: boolean[] = [];

  for (let generation = 1; generation <= generations; generation += 1) {
    const mutationSeedStep = nextUint32(prng);
    prng = mutationSeedStep.prng;
    const candidate = mutate(incumbent, sigma, seededRandom(mutationSeedStep.value));

    const seeds: number[] = [];
    for (let index = 0; index < seedsPerGeneration; index += 1) {
      const seedStep = nextUint32(prng);
      prng = seedStep.prng;
      seeds.push(seedStep.value);
    }

    const { candidateScore, baselineScore, totalMatches } = evaluateCandidate(
      seeds,
      incumbent,
      candidate,
    );
    const accepted = totalMatches > 0 && candidateScore > baselineScore;
    if (accepted) incumbent = candidate;

    recentOutcomes.push(accepted);
    if (recentOutcomes.length > SUCCESS_WINDOW) recentOutcomes.shift();
    if (recentOutcomes.length >= 5) {
      const successRate = recentOutcomes.filter(Boolean).length / recentOutcomes.length;
      sigma *= successRate > TARGET_SUCCESS_RATE ? 1.2 : 1 / 1.2 ** 0.25;
    }

    logs.push({
      generation,
      sigma,
      accepted,
      candidateScore,
      incumbentScore: baselineScore,
      matches: totalMatches,
    });
  }

  return { seed, generations: logs, baselineWeights: DEFAULT_JUNK_WEIGHTS, tunedWeights: incumbent };
};

export type FinalEvaluation = MatchupResult & { seeds: readonly number[] };

/** Held-out comparison on a seed range disjoint from the search (seed XOR'd with a
 * fixed constant), so the reported win rate isn't measured on the exact seeds the
 * search already adapted to. */
export const evaluateTunedWeights = (
  seed: number,
  evalSeeds: number,
  report: TuneReport,
): FinalEvaluation => {
  let prng = createPrng(seed ^ 0x5bd1_e995);
  const seeds: number[] = [];
  for (let index = 0; index < evalSeeds; index += 1) {
    const step = nextUint32(prng);
    prng = step.prng;
    seeds.push(step.value);
  }
  return { seeds, ...evaluateCandidate(seeds, report.baselineWeights, report.tunedWeights) };
};

const formatWeightDelta = (baseline: JunkWeights, tuned: JunkWeights): string =>
  WEIGHT_KEYS.map((key) => {
    const before = baseline[key];
    const after = tuned[key];
    const pct = before === 0 ? "n/a" : `${(((after - before) / Math.abs(before)) * 100).toFixed(1)}%`;
    return `  ${key}: ${before.toFixed(2)} -> ${after.toFixed(2)} (${pct})`;
  }).join("\n");

export const formatTuneReport = (
  report: TuneReport,
  finalEval: FinalEvaluation,
  options: TuneOptions,
): string => {
  const accepted = report.generations.filter((generation) => generation.accepted).length;
  const winRate =
    finalEval.totalMatches === 0
      ? "n/a"
      : `${((finalEval.candidateWins / finalEval.totalMatches) * 100).toFixed(1)}%`;
  return [
    "=== Junk AI weight tuning report ===",
    `search seed: ${report.seed}  generations: ${options.generations}  seeds/generation: ${options.seedsPerGeneration}`,
    `accepted mutations: ${accepted}/${options.generations}`,
    "",
    "Final held-out evaluation (baseline vs tuned, duplicate-deal paired, seeds disjoint from search):",
    `  matches: ${finalEval.totalMatches} (${finalEval.seeds.length} seeds x 2 seat splits)`,
    `  tuned total score: ${finalEval.candidateScore}   baseline total score: ${finalEval.baselineScore}`,
    `  tuned win rate: ${winRate}`,
    "",
    "Weight changes (baseline -> tuned):",
    formatWeightDelta(report.baselineWeights, report.tunedWeights),
    "",
    "This is a candidate only — it does not change any file. Review the numbers",
    "above, then manually update JUNK_FAN_WEIGHTS/DEFAULT_JUNK_WEIGHTS in",
    "strategy.ts if you want to adopt it.",
  ].join("\n");
};
