import { writeFileSync } from "node:fs";
import os from "node:os";
import {
  evaluateTunedWeights,
  formatTuneReport,
  tuneJunkWeights,
  type FinalEvaluation,
  type TuneReport,
  type TuneWriteStatus,
} from "./tune.ts";
import { MatchWorkerPool } from "./tune-pool.ts";

/** Same file strategy.ts's DEFAULT_JUNK_WEIGHTS loads from — this file lives
 * next to it in the same directory, so the relative URL always agrees. */
const DEFAULT_WEIGHTS_PATH = new URL("./default-weights.json", import.meta.url);

type Arguments = {
  seed: number;
  maxGenerations: number;
  minGenerations: number;
  seedsPerGeneration: number;
  evalSeeds: number;
  initialSigma: number;
  sigmaConvergenceRatio: number;
  stagnationPatience: number;
  maxSigma: number;
  concurrency: number;
  write: boolean;
};

const defaultConcurrency = (): number => {
  try {
    return os.availableParallelism();
  } catch {
    return os.cpus().length || 1;
  }
};

const usage =
  "Usage: junk/tune-cli.ts [--seed <int>] [--max-generations <int>] [--min-generations <int>] " +
  "[--seeds-per-generation <int>] [--eval-seeds <int>] [--sigma <float>] [--max-sigma <float>] " +
  "[--sigma-convergence-ratio <float>] [--stagnation-patience <int>] [--concurrency <int>] [--write]\n";

const parseArguments = (argv: string[]): Arguments => {
  const write = argv.includes("--write");
  const pairs = argv.filter((value) => value !== "--write");
  const result: Arguments = {
    seed: 1,
    maxGenerations: 100,
    minGenerations: 20,
    // 12 rather than the pipeline-smoke-test-era 4-6: each generation's
    // accept/reject call is only seedsPerGeneration*2 matches of signal against
    // real mahjong variance — too few and sigma can get driven up by noise
    // alone (see maxSigma's doc comment in tune.ts for what that leads to).
    seedsPerGeneration: 12,
    evalSeeds: 15,
    initialSigma: 0.15,
    sigmaConvergenceRatio: 0.05,
    stagnationPatience: 30,
    maxSigma: 2,
    concurrency: defaultConcurrency(),
    write,
  };
  for (let index = 0; index < pairs.length; index += 2) {
    const flag = pairs[index];
    const value = pairs[index + 1];
    if (!flag || value === undefined) throw new Error("MISSING_ARGUMENT_VALUE");
    if (flag === "--seed") result.seed = Number(value);
    else if (flag === "--max-generations") result.maxGenerations = Number(value);
    else if (flag === "--min-generations") result.minGenerations = Number(value);
    else if (flag === "--seeds-per-generation") result.seedsPerGeneration = Number(value);
    else if (flag === "--eval-seeds") result.evalSeeds = Number(value);
    else if (flag === "--sigma") result.initialSigma = Number(value);
    else if (flag === "--max-sigma") result.maxSigma = Number(value);
    else if (flag === "--sigma-convergence-ratio") result.sigmaConvergenceRatio = Number(value);
    else if (flag === "--stagnation-patience") result.stagnationPatience = Number(value);
    else if (flag === "--concurrency") result.concurrency = Number(value);
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (
    !Number.isInteger(result.seed) ||
    !Number.isInteger(result.maxGenerations) ||
    result.maxGenerations < 1 ||
    !Number.isInteger(result.minGenerations) ||
    result.minGenerations < 1 ||
    result.minGenerations > result.maxGenerations ||
    !Number.isInteger(result.seedsPerGeneration) ||
    result.seedsPerGeneration < 1 ||
    !Number.isInteger(result.evalSeeds) ||
    result.evalSeeds < 1 ||
    !(result.initialSigma > 0) ||
    !(result.maxSigma >= result.initialSigma) ||
    !(result.sigmaConvergenceRatio > 0 && result.sigmaConvergenceRatio < 1) ||
    !Number.isInteger(result.stagnationPatience) ||
    result.stagnationPatience < 1 ||
    !Number.isInteger(result.concurrency) ||
    result.concurrency < 1
  ) {
    throw new Error("INVALID_NUMERIC_ARGUMENT");
  }
  return result;
};

/**
 * --write is still an explicit, human-triggered action (the human decides to pass
 * the flag before ever running the command) — this does not reintroduce automatic
 * adoption. It only refuses to write when the held-out evaluation shows the
 * search's own result regressed against the baseline, as one extra guard against
 * writing a candidate that got lucky against the (small) search-time seed batch
 * but doesn't actually hold up.
 */
const writeTunedWeights = (
  finalEval: FinalEvaluation,
  report: TuneReport,
  log: (line: string) => void,
): TuneWriteStatus => {
  if (finalEval.candidateScore < finalEval.baselineScore) {
    const reason =
      "held-out evaluation did not show an improvement (tuned score < baseline " +
      "score) — rerun with more generations/seeds, or edit default-weights.json by hand.";
    log(`[tune] --write skipped: ${reason}\n`);
    return { attempted: true, written: false, reason };
  }
  writeFileSync(DEFAULT_WEIGHTS_PATH, `${JSON.stringify(report.tunedWeights, null, 2)}\n`);
  log(`[tune] wrote tuned weights to ${DEFAULT_WEIGHTS_PATH.pathname}\n`);
  return { attempted: true, written: true, path: DEFAULT_WEIGHTS_PATH.pathname };
};

/** Progress goes to stderr (never stdout) so `pnpm tune:junk > report.txt` still
 * captures only the final report; `log` is injectable so this stays testable. */
export const runTuneCli = async (
  argv: string[],
  log: (line: string) => void = (line) => process.stderr.write(line),
): Promise<{ exitCode: number; output: string }> => {
  let pool: MatchWorkerPool | undefined;
  try {
    const args = parseArguments(argv);
    const worstCaseMatches = args.maxGenerations * args.seedsPerGeneration * 2 + args.evalSeeds * 2;
    log(
      `[tune] max-generations=${args.maxGenerations} (min ${args.minGenerations}, stops early on ` +
        `convergence) seeds/generation=${args.seedsPerGeneration} eval-seeds=${args.evalSeeds} ` +
        `concurrency=${args.concurrency}  worst case ~${worstCaseMatches} matches\n`,
    );
    pool = new MatchWorkerPool(args.concurrency);
    const startedAt = Date.now();
    const report = await tuneJunkWeights(args.seed, {
      maxGenerations: args.maxGenerations,
      minGenerations: args.minGenerations,
      seedsPerGeneration: args.seedsPerGeneration,
      initialSigma: args.initialSigma,
      sigmaConvergenceRatio: args.sigmaConvergenceRatio,
      stagnationPatience: args.stagnationPatience,
      maxSigma: args.maxSigma,
      pool,
      onGeneration: (generationLog) => {
        const elapsedSec = (Date.now() - startedAt) / 1000;
        // "eta" here is time-to-cap, an upper bound — early stopping usually means
        // the run finishes well before this, not exactly at it.
        const etaToCapSec =
          (elapsedSec / generationLog.generation) * (args.maxGenerations - generationLog.generation);
        log(
          `[gen ${generationLog.generation}/${args.maxGenerations}] ` +
            `${generationLog.accepted ? "accepted" : "rejected"}  sigma=${generationLog.sigma.toFixed(3)}  ` +
            `candidate=${generationLog.candidateScore} incumbent=${generationLog.incumbentScore}  ` +
            `elapsed=${elapsedSec.toFixed(0)}s eta-to-cap=${etaToCapSec.toFixed(0)}s\n`,
        );
      },
    });
    log(
      `[tune] search stopped after ${report.generations.length} generations ` +
        `(${report.stopReason}) in ${((Date.now() - startedAt) / 1000).toFixed(0)}s, ` +
        "running held-out evaluation...\n",
    );
    const finalEval = await evaluateTunedWeights(args.seed, args.evalSeeds, report, pool);
    const writeStatus: TuneWriteStatus = args.write
      ? writeTunedWeights(finalEval, report, log)
      : { attempted: false };
    return { exitCode: 0, output: `${formatTuneReport(report, finalEval, args, writeStatus)}\n` };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  } finally {
    await pool?.close();
  }
};

const output = await runTuneCli(process.argv.slice(2));
process.stdout.write(output.output);
process.exitCode = output.exitCode;
