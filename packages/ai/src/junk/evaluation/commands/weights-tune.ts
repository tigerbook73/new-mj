import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTextEvaluationArtifactsAvailable,
  writeTextEvaluationArtifacts,
  type TextArtifactRuntime,
} from "../../../evaluation/text-artifacts.ts";
import {
  evaluateTunedWeights,
  formatTuneReport,
  tuneJunkWeights,
  WEIGHT_KEYS,
  type FinalEvaluation,
  type TuneReport,
  type TuneWriteStatus,
} from "../match/tune.ts";
import { MatchWorkerPool, type MatchTask } from "../match/tune-pool.ts";
import type { JunkWeights } from "../../strategy.ts";

/** Same JSON asset weights.ts loads as DEFAULT_JUNK_WEIGHTS. */
const DEFAULT_WEIGHTS_PATH = new URL("../../default-weights.json", import.meta.url);

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
  outputDir: string;
  runId?: string;
  write: boolean;
  /** Restricts the search to this subset of JunkWeights keys (see tune.ts's
   * mutate/TuneOptions.weightKeys); undefined means "search all of them",
   * same as before this flag existed. */
  only?: (keyof JunkWeights)[];
};

const packageRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const defaultOutputDir = path.join(packageRoot, ".evaluation-runs");

const defaultConcurrency = (): number => {
  try {
    return os.availableParallelism();
  } catch {
    return os.cpus().length || 1;
  }
};

const usage =
  "Usage: pnpm --filter @new-mj/ai evaluate weights tune [--seed <int>] [--max-generations <int>] [--min-generations <int>] " +
  "[--seeds-per-generation <int>] [--eval-seeds <int>] [--sigma <float>] [--max-sigma <float>] " +
  "[--sigma-convergence-ratio <float>] [--stagnation-patience <int>] [--concurrency <int>] " +
  `[--only <comma-separated JunkWeights keys, e.g. tenpaiProbabilityWeight — one of: ${WEIGHT_KEYS.join(",")}>] ` +
  "[--output-dir <dir>] [--run-id <id>] [--write]\n";

const parseArguments = (argv: string[]): Arguments => {
  const write = argv.includes("--write");
  const pairs = argv.filter((value) => value !== "--write");
  const result: Arguments = {
    seed: 1,
    maxGenerations: 100,
    minGenerations: 20,
    // 15 rather than the pipeline-smoke-test-era 4-6: each generation's
    // accept/reject call is only seedsPerGeneration*2 matches of signal against
    // real mahjong variance — too few and even single-dimension mutations (see
    // tune.ts's mutate) get accepted/rejected by noise rather than genuine signal.
    seedsPerGeneration: 15,
    evalSeeds: 15,
    initialSigma: 0.15,
    sigmaConvergenceRatio: 0.05,
    stagnationPatience: 30,
    maxSigma: 1,
    concurrency: defaultConcurrency(),
    outputDir: defaultOutputDir,
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
    else if (flag === "--output-dir") result.outputDir = value;
    else if (flag === "--run-id") result.runId = value;
    else if (flag === "--only") {
      const requested = value.split(",").map((key) => key.trim());
      const invalid = requested.filter((key) => !(WEIGHT_KEYS as string[]).includes(key));
      if (requested.length === 0 || invalid.length > 0) {
        throw new Error(`INVALID_ONLY_KEYS: ${invalid.join(",") || "(empty)"}`);
      }
      result.only = requested as (keyof JunkWeights)[];
    } else throw new Error("UNKNOWN_ARGUMENT");
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
  if (result.runId !== undefined && !/^[a-zA-Z0-9._-]+$/.test(result.runId))
    throw new Error("INVALID_RUN_ID");
  return result;
};

type TuneCliRuntime = TextArtifactRuntime &
  Readonly<{
    now?: () => Date;
    gitSha?: () => string;
    createPool?: (concurrency: number) => MatchWorkerPool<MatchTask>;
    tune?: typeof tuneJunkWeights;
    evaluate?: typeof evaluateTunedWeights;
  }>;

const currentGitSha = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
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

/** Progress goes to stderr while the final report and artifact paths go to
 * stdout; `log` is injectable so this stays testable. */
export const runTuneCli = async (
  argv: readonly string[],
  log: (line: string) => void = (line) => process.stderr.write(line),
  runtime: TuneCliRuntime = {},
): Promise<{ exitCode: number; output: string }> => {
  if (argv.includes("--help")) return { exitCode: 0, output: usage };
  let pool: MatchWorkerPool<MatchTask> | undefined;
  try {
    const args = parseArguments([...argv]);
    const startedAt = (runtime.now ?? (() => new Date()))();
    const runId = args.runId ?? `run-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    const fileStem = `junk-weights-tune-${runId}`;
    assertTextEvaluationArtifactsAvailable(args.outputDir, fileStem, runtime);
    const worstCaseMatches = args.maxGenerations * args.seedsPerGeneration * 2 + args.evalSeeds * 2;
    log(
      `[tune] max-generations=${args.maxGenerations} (min ${args.minGenerations}, stops early on ` +
        `convergence) seeds/generation=${args.seedsPerGeneration} eval-seeds=${args.evalSeeds} ` +
        `concurrency=${args.concurrency}  worst case ~${worstCaseMatches} matches\n`,
    );
    pool = runtime.createPool
      ? runtime.createPool(args.concurrency)
      : new MatchWorkerPool<MatchTask>(
          args.concurrency,
          new URL("../match/tune-worker.ts", import.meta.url),
        );
    const searchStartedAt = Date.now();
    const report = await (runtime.tune ?? tuneJunkWeights)(args.seed, {
      maxGenerations: args.maxGenerations,
      minGenerations: args.minGenerations,
      seedsPerGeneration: args.seedsPerGeneration,
      initialSigma: args.initialSigma,
      sigmaConvergenceRatio: args.sigmaConvergenceRatio,
      stagnationPatience: args.stagnationPatience,
      maxSigma: args.maxSigma,
      pool,
      ...(args.only ? { weightKeys: args.only } : {}),
      onGeneration: (generationLog) => {
        const elapsedSec = (Date.now() - searchStartedAt) / 1000;
        // "eta" here is time-to-cap, an upper bound — early stopping usually means
        // the run finishes well before this, not exactly at it.
        const etaToCapSec =
          (elapsedSec / generationLog.generation) *
          (args.maxGenerations - generationLog.generation);
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
        `(${report.stopReason}) in ${((Date.now() - searchStartedAt) / 1000).toFixed(0)}s, ` +
        "running held-out evaluation...\n",
    );
    const finalEval = await (runtime.evaluate ?? evaluateTunedWeights)(
      args.seed,
      args.evalSeeds,
      report,
      pool,
    );
    const writeStatus: TuneWriteStatus = args.write
      ? writeTunedWeights(finalEval, report, log)
      : { attempted: false };
    // args is passed as TuneOptions for its shared numeric fields (maxGenerations,
    // seedsPerGeneration, ...) — it doesn't actually have a weightKeys field
    // (it has `only`, the CLI-facing name), so that has to be added explicitly
    // or formatTuneReport always falls back to "search all of them".
    const reportOptions = { ...args, ...(args.only ? { weightKeys: args.only } : {}) };
    const textReport = `${formatTuneReport(report, finalEval, reportOptions, writeStatus)}\n`;
    const paths = writeTextEvaluationArtifacts(
      args.outputDir,
      fileStem,
      {
        run: {
          schemaVersion: 1,
          runId,
          command: `pnpm --filter @new-mj/ai evaluate weights tune ${argv.join(" ")}`.trim(),
          gitSha: (runtime.gitSha ?? currentGitSha)(),
          startedAt: startedAt.toISOString(),
        },
        data: {
          seed: args.seed,
          maxGenerations: args.maxGenerations,
          minGenerations: args.minGenerations,
          seedsPerGeneration: args.seedsPerGeneration,
          evalSeeds: args.evalSeeds,
          concurrency: args.concurrency,
          searchedWeights: args.only ?? WEIGHT_KEYS,
          report,
          finalEvaluation: finalEval,
          writeStatus,
        },
      },
      textReport,
      runtime,
    );
    return {
      exitCode: 0,
      output: `${textReport}json: ${paths.jsonPath}\ntext: ${paths.textPath}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  } finally {
    await pool?.close();
  }
};
