import { createPrng, nextUint32, SEAT_IDS, type SeatId } from "@new-mj/core";
import { playJunkMatch, strengthPolicy, type JunkMatchResult, type SeatPolicy } from "./arena.ts";
import { buildPolicy } from "./policy-loader.ts";
import { DEFAULT_JUNK_WEIGHTS, type JunkWeights } from "./strategy.ts";
import type { MatchTask, MatchTaskResult, MatchWorkerPool, PolicyMatchTask } from "./tune-pool.ts";

/** Two MatchWorkerPool instantiations flow through this file: the weight-based
 * one (tune:junk's hot loop, tune-worker.ts) and the cross-version policy-based
 * one (evaluateCandidatePolicies below, policy-match-worker.ts). */
type WeightMatchPool = MatchWorkerPool<MatchTask>;
type PolicyMatchPool = MatchWorkerPool<PolicyMatchTask>;

/** Exported so compare-weights-cli.ts can validate an arbitrary candidate JSON
 * file has exactly this key set without duplicating the list. */
export const WEIGHT_KEYS = Object.keys(DEFAULT_JUNK_WEIGHTS) as (keyof JunkWeights)[];

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
 * Mutates exactly one randomly-chosen weight per call (coordinate-wise
 * perturbation), not all 13 at once. Mutating every dimension simultaneously
 * sounded reasonable but wasn't: even a "moderate" per-dimension sigma compounds
 * across 13 independent draws into a candidate that's nowhere near the
 * incumbent, so accept/reject stopped measuring "is this direction better" and
 * started measuring "did this batch of 13 coin flips land in our favor" — noise,
 * not signal (confirmed by two real tuning runs converging on garbage weights
 * despite a capped sigma). One dimension at a time keeps each generation's
 * comparison meaningful: a single, log-normal multiplicative step (every weight
 * moves by roughly the same *relative* percentage regardless of its absolute
 * scale — shantenWeight ~100 vs pairBonus ~2 — so a single additive step
 * wouldn't be comparable across dimensions), clamped to keep pathological drift
 * finite. `eligibleKeys` is normally all of WEIGHT_KEYS, but a caller can pass a
 * subset (see TuneOptions.weightKeys / tune-cli.ts's --only) to pin every other
 * weight and search along just one dimension — a plain 1D step-size-adaptive
 * line search falls out of this "coordinate descent over one key" mechanism for
 * free when the eligible set has exactly one key in it.
 */
const mutate = (
  weights: JunkWeights,
  sigma: number,
  random: () => number,
  eligibleKeys: readonly (keyof JunkWeights)[],
): JunkWeights => {
  const mutated = { ...weights };
  const key = eligibleKeys[Math.floor(random() * eligibleKeys.length)]!;
  mutated[key] = clamp(mutated[key] * Math.exp(sigma * gaussian(random)), 0.01, 10_000);
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

/** Shared by runMatchTask (weight-based, worker-pool-capable) and
 * evaluateCandidatePolicies (policy-based, see below) so both reduce a finished
 * match to a candidate/baseline score split the exact same way. */
const splitMatchScore = (
  result: JunkMatchResult,
  candidateSeats: readonly SeatId[],
): { candidateTotal: number; baselineTotal: number } => {
  const candidateTotal = candidateSeats.reduce<number>((sum, seat) => sum + result.scores[seat], 0);
  const baselineTotal = result.scores.reduce((sum, score) => sum + score, 0) - candidateTotal;
  return { candidateTotal, baselineTotal };
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
  return { ok: true, ...splitMatchScore(result, task.candidateSeats) };
};

/** A policy source already reduced to serializable fields (see
 * policy-loader.ts's resolveModulePath) — the currency runPolicyMatchTask and
 * evaluateCandidatePolicies pass around, since a live SeatPolicy closure can't
 * cross a worker_thread postMessage boundary. */
export type ResolvedPolicySource = Readonly<{ modulePath: string; weightsPath?: string }>;

/** Policy-based counterpart to runMatchTask: imports both sides (buildPolicy
 * caches via Node's own module cache, so repeated calls with the same
 * modulePath across many tasks in one thread don't re-execute the module) and
 * plays one (seed, seat-split) match. This is the unit of work
 * policy-match-worker.ts ships to a worker thread, and also what the
 * sequential fallback below calls directly on the main thread. */
export const runPolicyMatchTask = async (task: PolicyMatchTask): Promise<MatchTaskResult> => {
  const [baselinePolicy, candidatePolicy] = await Promise.all([
    buildPolicy(task.baselineModulePath, task.baselineWeightsPath),
    buildPolicy(task.candidateModulePath, task.candidateWeightsPath),
  ]);
  const policies = SEAT_IDS.map((seat) =>
    task.candidateSeats.includes(seat) ? candidatePolicy : baselinePolicy,
  ) as [SeatPolicy, SeatPolicy, SeatPolicy, SeatPolicy];
  const result = playJunkMatch(task.seed, policies);
  if ("error" in result) return { ok: false, candidateTotal: 0, baselineTotal: 0 };
  return { ok: true, ...splitMatchScore(result, task.candidateSeats) };
};

const policyMatchTask = (
  seed: number,
  candidateSeats: readonly SeatId[],
  baseline: ResolvedPolicySource,
  candidate: ResolvedPolicySource,
): PolicyMatchTask => ({
  seed,
  candidateSeats,
  baselineModulePath: baseline.modulePath,
  ...(baseline.weightsPath !== undefined ? { baselineWeightsPath: baseline.weightsPath } : {}),
  candidateModulePath: candidate.modulePath,
  ...(candidate.weightsPath !== undefined ? { candidateWeightsPath: candidate.weightsPath } : {}),
});

/**
 * Policy-based counterpart to evaluateCandidate, for when baseline/candidate
 * aren't just two weight values on the same code — e.g. a cross-version
 * comparison via policy-loader.ts's resolveModulePath. Takes already-resolved
 * module paths (not live SeatPolicy functions, which can't cross a
 * worker_thread postMessage boundary) so it can dispatch through a pool the
 * same way evaluateCandidate does; runs sequentially (still via the identical
 * runPolicyMatchTask, just called directly) when no pool is given. Reuses the
 * same CANDIDATE_SEAT_SPLITS duplicate-deal design so seat-position effects
 * cancel out the same way.
 */
export const evaluateCandidatePolicies = async (
  seeds: readonly number[],
  baseline: ResolvedPolicySource,
  candidate: ResolvedPolicySource,
  pool?: PolicyMatchPool,
): Promise<MatchupResult> => {
  const tasks: PolicyMatchTask[] = seeds.flatMap((seed) =>
    CANDIDATE_SEAT_SPLITS.map((candidateSeats) =>
      policyMatchTask(seed, candidateSeats, baseline, candidate),
    ),
  );
  const results = pool
    ? await pool.runAll(tasks)
    : await Promise.all(tasks.map(runPolicyMatchTask));

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
  pool?: WeightMatchPool,
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
  /** Hard ceiling on sigma growth. Without this, a lucky streak of noisy
   * "successes" (evaluateCandidate is only seedsPerGeneration*2 matches — real
   * variance) can drive the 1/5 rule's step size up without bound — a
   * self-reinforcing runaway with no natural ceiling otherwise. Now that mutate()
   * only ever touches one weight per generation (see its doc comment), this only
   * needs to bound a single dimension's step, not 13 compounding at once. */
  maxSigma?: number;
  /** Invoked synchronously after each generation completes, before the next one
   * starts — lets a CLI print progress without tune.ts itself doing any I/O. */
  onGeneration?: (log: TuneGenerationLog) => void;
  /** Runs every generation's matches through this pool instead of sequentially
   * on the main thread. Omit for the (slower but dependency-free) default. */
  pool?: WeightMatchPool;
  /** Restricts mutation to this subset of JunkWeights keys (see mutate's doc
   * comment) — every other weight stays pinned at its DEFAULT_JUNK_WEIGHTS
   * value for the whole run. Defaults to WEIGHT_KEYS (search all of them),
   * same as before this option existed. Useful for isolating a single
   * newly-introduced weight (e.g. tenpaiProbabilityWeight) from the rest of an
   * already-tuned vector, so a run's accept/reject history only ever reflects
   * that one dimension. */
  weightKeys?: readonly (keyof JunkWeights)[];
};

const SUCCESS_WINDOW = 10;
const TARGET_SUCCESS_RATE = 0.2; // Rechenberg's 1/5 rule

/**
 * (1+1) evolution strategy with the 1/5 success rule: each generation mutates one
 * randomly-chosen weight of the current incumbent (see mutate's doc comment for
 * why not all 13 at once), keeps the mutant only if it beats the incumbent in
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
    maxSigma = 1,
    pool,
    weightKeys = WEIGHT_KEYS,
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
    const candidate = mutate(incumbent, sigma, seededRandom(mutationSeedStep.value), weightKeys);

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
      sigma = Math.min(
        sigma * (successRate > TARGET_SUCCESS_RATE ? 1.2 : 1 / 1.2 ** 0.25),
        maxSigma,
      );
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
  pool?: WeightMatchPool,
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

/** Exported so compare-weights-cli.ts can render the same "baseline -> other"
 * delta table for an arbitrary hand-authored candidate, not just a search result. */
export const formatWeightDelta = (baseline: JunkWeights, tuned: JunkWeights): string =>
  WEIGHT_KEYS.map((key) => {
    const before = baseline[key];
    const after = tuned[key];
    const pct =
      before === 0 ? "n/a" : `${(((after - before) / Math.abs(before)) * 100).toFixed(1)}%`;
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
  "sigma-converged":
    "sigma shrank below the convergence threshold (mutations stopped meaningfully exploring)",
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
    `weights searched: ${(options.weightKeys ?? WEIGHT_KEYS).join(", ")}` +
      (options.weightKeys ? " (restricted via --only, everything else pinned)" : ""),
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
