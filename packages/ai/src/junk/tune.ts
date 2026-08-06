import { createPrng, nextUint32, SEAT_IDS, type SeatId } from "@new-mj/core";
import { playJunkMatch, strengthPolicy, type SeatPolicy } from "./arena.ts";
import { DEFAULT_JUNK_WEIGHTS, type JunkWeights } from "./strategy.ts";
import type { MatchTask, MatchTaskResult, MatchWorkerPool } from "./tune-pool.ts";

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
 * Plays one (seed, seat-split) match and reduces it to a candidate/baseline score
 * split. Pure and side-effect-free by design — this is the exact unit of work a
 * MatchWorkerPool ships to a worker thread (see tune-worker.ts), and also what the
 * sequential fallback below calls directly on the main thread. Keeping both paths
 * call the identical function (rather than two parallel implementations) is what
 * guarantees the parallel and sequential results match, not just testing for it.
 */
export const runMatchTask = (task: MatchTask): MatchTaskResult => {
  const policies = SEAT_IDS.map((seat) =>
    task.candidateSeats.includes(seat)
      ? strengthPolicy({}, task.candidateWeights)
      : strengthPolicy({}, task.baselineWeights),
  ) as [SeatPolicy, SeatPolicy, SeatPolicy, SeatPolicy];
  const result = playJunkMatch(task.seed, policies);
  if ("error" in result) return { ok: false, candidateTotal: 0, baselineTotal: 0 };
  const candidateTotal = task.candidateSeats.reduce<number>(
    (sum, seat) => sum + result.scores[seat],
    0,
  );
  const baselineTotal = result.scores.reduce((sum, score) => sum + score, 0) - candidateTotal;
  return { ok: true, candidateTotal, baselineTotal };
};

/**
 * Compares two weight sets by self-play: for every seed, both seat splits are
 * played (same wall/deal, candidate/baseline seats swapped) so deal-luck and
 * seat-position effects cancel out across the pair — a lightweight version of
 * duplicate-deal comparison, not literal single-hand replay (a 4-seat game has
 * no notion of "the same hand" for two independent policies at once).
 *
 * Runs sequentially on the main thread when no pool is given (used by tests and
 * anywhere a full worker pool would be overkill); dispatches through the pool
 * otherwise, for real wall-clock speedup on multi-core machines.
 */
export const evaluateCandidate = async (
  seeds: readonly number[],
  baseline: JunkWeights,
  candidate: JunkWeights,
  pool?: MatchWorkerPool,
): Promise<MatchupResult> => {
  const tasks: MatchTask[] = seeds.flatMap((seed) =>
    CANDIDATE_SEAT_SPLITS.map((candidateSeats) => ({
      seed,
      candidateSeats,
      baselineWeights: baseline,
      candidateWeights: candidate,
    })),
  );
  const results = pool ? await pool.runAll(tasks) : tasks.map(runMatchTask);

  let candidateScore = 0;
  let baselineScore = 0;
  let candidateWins = 0;
  let totalMatches = 0;
  for (const result of results) {
    if (!result.ok) continue;
    totalMatches += 1;
    candidateScore += result.candidateTotal;
    baselineScore += result.baselineTotal;
    if (result.candidateTotal > result.baselineTotal) candidateWins += 1;
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

/** Why the search loop stopped, reported so a human can tell "it converged" from
 * "it hit the safety cap without converging" without re-reading every generation. */
export type TuneStopReason = "max-generations" | "sigma-converged" | "stagnant";

export type TuneReport = {
  seed: number;
  generations: TuneGenerationLog[];
  baselineWeights: JunkWeights;
  tunedWeights: JunkWeights;
  stopReason: TuneStopReason;
};

export type TuneOptions = {
  /** Hard safety cap — the search always stops here even if neither convergence
   * signal below has fired yet. In practice it should rarely be reached. */
  maxGenerations: number;
  seedsPerGeneration: number;
  initialSigma?: number;
  /** No convergence check runs before this many generations: the 1/5 rule's own
   * step-size adaptation needs a few generations of history (see SUCCESS_WINDOW)
   * before sigma means anything, and a run of early rejections is normal, not
   * evidence of convergence. */
  minGenerations?: number;
  /** Stop once sigma shrinks to this fraction of initialSigma — mutations that
   * small are no longer meaningfully exploring, just noise around the incumbent. */
  sigmaConvergenceRatio?: number;
  /** Stop after this many consecutive generations with no accepted mutation,
   * regardless of where sigma is — a second, independent convergence signal
   * (in practice it usually fires around the same time as sigma-converged,
   * since sustained rejection also drives sigma down via the 1/5 rule). */
  stagnationPatience?: number;
  /** Invoked synchronously after each generation completes, before the next one
   * starts — lets a CLI print progress without tune.ts itself doing any I/O. */
  onGeneration?: (log: TuneGenerationLog) => void;
  /** Runs every generation's matches through this pool instead of sequentially
   * on the main thread. Omit for the (slower but dependency-free) default. */
  pool?: MatchWorkerPool;
};

const SUCCESS_WINDOW = 10;
const TARGET_SUCCESS_RATE = 0.2; // Rechenberg's 1/5 rule

/**
 * (1+1) evolution strategy with the 1/5 success rule: each generation mutates the
 * current incumbent once, keeps the mutant only if it beats the incumbent in
 * self-play (see evaluateCandidate), and adjusts the mutation step size to track
 * a ~20% acceptance rate — widen the search while succeeding often, narrow it
 * while mostly failing. No external optimization library; see AGENTS.md for why.
 *
 * Stops itself once it detects convergence (see TuneStopReason) instead of always
 * running to maxGenerations — the caller shouldn't have to pre-guess how many
 * generations are "enough".
 */
export const tuneJunkWeights = async (seed: number, options: TuneOptions): Promise<TuneReport> => {
  const {
    maxGenerations,
    seedsPerGeneration,
    initialSigma = 0.15,
    minGenerations = 20,
    sigmaConvergenceRatio = 0.05,
    stagnationPatience = 30,
    pool,
  } = options;
  let incumbent = DEFAULT_JUNK_WEIGHTS;
  let sigma = initialSigma;
  let prng = createPrng(seed);
  const logs: TuneGenerationLog[] = [];
  const recentOutcomes: boolean[] = [];
  let generationsSinceAccept = 0;
  let stopReason: TuneStopReason = "max-generations";

  for (let generation = 1; generation <= maxGenerations; generation += 1) {
    const mutationSeedStep = nextUint32(prng);
    prng = mutationSeedStep.prng;
    const candidate = mutate(incumbent, sigma, seededRandom(mutationSeedStep.value));

    const seeds: number[] = [];
    for (let index = 0; index < seedsPerGeneration; index += 1) {
      const seedStep = nextUint32(prng);
      prng = seedStep.prng;
      seeds.push(seedStep.value);
    }

    const { candidateScore, baselineScore, totalMatches } = await evaluateCandidate(
      seeds,
      incumbent,
      candidate,
      pool,
    );
    const accepted = totalMatches > 0 && candidateScore > baselineScore;
    if (accepted) {
      incumbent = candidate;
      generationsSinceAccept = 0;
    } else {
      generationsSinceAccept += 1;
    }

    recentOutcomes.push(accepted);
    if (recentOutcomes.length > SUCCESS_WINDOW) recentOutcomes.shift();
    if (recentOutcomes.length >= 5) {
      const successRate = recentOutcomes.filter(Boolean).length / recentOutcomes.length;
      sigma *= successRate > TARGET_SUCCESS_RATE ? 1.2 : 1 / 1.2 ** 0.25;
    }

    const log: TuneGenerationLog = {
      generation,
      sigma,
      accepted,
      candidateScore,
      incumbentScore: baselineScore,
      matches: totalMatches,
    };
    logs.push(log);
    options.onGeneration?.(log);

    if (generation >= minGenerations) {
      if (sigma <= initialSigma * sigmaConvergenceRatio) {
        stopReason = "sigma-converged";
        break;
      }
      if (generationsSinceAccept >= stagnationPatience) {
        stopReason = "stagnant";
        break;
      }
    }
  }

  return {
    seed,
    generations: logs,
    baselineWeights: DEFAULT_JUNK_WEIGHTS,
    tunedWeights: incumbent,
    stopReason,
  };
};

export type FinalEvaluation = MatchupResult & { seeds: readonly number[] };

/** Held-out comparison on a seed range disjoint from the search (seed XOR'd with a
 * fixed constant), so the reported win rate isn't measured on the exact seeds the
 * search already adapted to. */
export const evaluateTunedWeights = async (
  seed: number,
  evalSeeds: number,
  report: TuneReport,
  pool?: MatchWorkerPool,
): Promise<FinalEvaluation> => {
  let prng = createPrng(seed ^ 0x5bd1_e995);
  const seeds: number[] = [];
  for (let index = 0; index < evalSeeds; index += 1) {
    const step = nextUint32(prng);
    prng = step.prng;
    seeds.push(step.value);
  }
  return {
    seeds,
    ...(await evaluateCandidate(seeds, report.baselineWeights, report.tunedWeights, pool)),
  };
};

const formatWeightDelta = (baseline: JunkWeights, tuned: JunkWeights): string =>
  WEIGHT_KEYS.map((key) => {
    const before = baseline[key];
    const after = tuned[key];
    const pct = before === 0 ? "n/a" : `${(((after - before) / Math.abs(before)) * 100).toFixed(1)}%`;
    return `  ${key}: ${before.toFixed(2)} -> ${after.toFixed(2)} (${pct})`;
  }).join("\n");

/** Reported at the bottom of the tune report so it always reflects what actually
 * happened to default-weights.json, not a boilerplate disclaimer. `attempted` is
 * false when the CLI wasn't given --write (still the default; nothing writes
 * unless a human explicitly asks for it on that invocation). */
export type TuneWriteStatus =
  | { attempted: false }
  | { attempted: true; written: true; path: string }
  | { attempted: true; written: false; reason: string };

const formatWriteStatus = (status: TuneWriteStatus): string[] => {
  if (!status.attempted) {
    return [
      "This is a candidate only — it does not change any file. Review the numbers",
      "above, then manually update JUNK_FAN_WEIGHTS/DEFAULT_JUNK_WEIGHTS in",
      "strategy.ts (or rerun with --write) if you want to adopt it.",
    ];
  }
  if (status.written) {
    return [`--write: wrote the tuned weights to ${status.path}.`];
  }
  return [`--write: skipped — ${status.reason}`];
};

const STOP_REASON_TEXT: Record<TuneStopReason, string> = {
  "max-generations":
    "hit the max-generations cap without converging — consider raising " +
    "--max-generations, or lowering --stagnation-patience/raising " +
    "--sigma-convergence-ratio if this happens a lot",
  "sigma-converged": "sigma shrank below the convergence threshold (mutations stopped meaningfully exploring)",
  stagnant: "no accepted mutation for --stagnation-patience generations in a row",
};

export const formatTuneReport = (
  report: TuneReport,
  finalEval: FinalEvaluation,
  options: TuneOptions,
  writeStatus: TuneWriteStatus = { attempted: false },
): string => {
  const accepted = report.generations.filter((generation) => generation.accepted).length;
  const ranGenerations = report.generations.length;
  const winRate =
    finalEval.totalMatches === 0
      ? "n/a"
      : `${((finalEval.candidateWins / finalEval.totalMatches) * 100).toFixed(1)}%`;
  return [
    "=== Junk AI weight tuning report ===",
    `search seed: ${report.seed}  seeds/generation: ${options.seedsPerGeneration}`,
    `ran ${ranGenerations}/${options.maxGenerations} generations, ${accepted} accepted ` +
      `— stopped: ${STOP_REASON_TEXT[report.stopReason]}`,
    "",
    "Final held-out evaluation (baseline vs tuned, duplicate-deal paired, seeds disjoint from search):",
    `  matches: ${finalEval.totalMatches} (${finalEval.seeds.length} seeds x 2 seat splits)`,
    `  tuned total score: ${finalEval.candidateScore}   baseline total score: ${finalEval.baselineScore}`,
    `  tuned win rate: ${winRate}`,
    "",
    "Weight changes (baseline -> tuned):",
    formatWeightDelta(report.baselineWeights, report.tunedWeights),
    "",
    ...formatWriteStatus(writeStatus),
  ].join("\n");
};
