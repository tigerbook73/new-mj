import os from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrng, nextUint32 } from "@new-mj/core";
import {
  assertTextEvaluationArtifactsAvailable,
  writeTextEvaluationArtifacts,
} from "../../../evaluation/text-artifacts.ts";
import {
  formatWeightDelta,
  evaluateCandidate,
  evaluateCandidatePolicies,
  WEIGHT_KEYS,
  type MatchupResult,
} from "../match/tune.ts";
import { MatchWorkerPool, type MatchTask, type PolicyMatchTask } from "../match/tune-pool.ts";
import { loadWeightsFile, resolveModulePath, type PolicySource } from "../policy/policy-loader.ts";

/**
 * General-purpose A/B primitive for any AI-quality change expressed as weights:
 * unlike tune-cli.ts (which only ever compares a *search-generated* candidate
 * against the incumbent), this compares two arbitrary, hand-specified weight
 * files by self-play — the baseline (A, defaults to the committed
 * default-weights.json) against a candidate (B, any JSON path — e.g. a scratch
 * file holding a hand-edited or externally-produced weight set under
 * evaluation, kept out of git until it clears this comparison). See
 * packages/ai/AGENTS.md "AI 质量调优的 A/B 流程" for when to use this vs.
 * fixture-based regression tests and decision-diff-cli.ts.
 *
 * `--baseline-module`/`--baseline-ref` (and the candidate equivalents) let A/B
 * cross code versions too, not just weight values, via policy-loader.ts's
 * resolveModulePath — same mechanism decision-diff-cli.ts uses for loading, but
 * this path stays on module *paths* (not live SeatPolicy closures) all the way
 * through so it can dispatch through a worker pool too (policy-match-worker.ts),
 * same as the plain same-code weight comparison.
 */

type Arguments = {
  /** Weight file path override; unset means "use that side's own defaults"
   * (current default-weights.json on the fast path, or the loaded module's own
   * DEFAULT_JUNK_WEIGHTS on the cross-version path — see loadPolicy). Named
   * --baseline/--candidate (not --baseline-weights) for backward compatibility:
   * this predates decision-diff-cli.ts's --baseline-weights naming. */
  baselineWeightsPath?: string;
  candidateWeightsPath?: string;
  baselineModule?: string;
  baselineRef?: string;
  candidateModule?: string;
  candidateRef?: string;
  seed: number;
  seeds: number;
  concurrency: number;
  outputDir: string;
  runId?: string;
};

const DEFAULT_WEIGHTS_PATH = new URL("../../default-weights.json", import.meta.url);
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
  "Usage: pnpm --filter @new-mj/ai evaluate weights compare\n" +
  "  [--baseline <weights-path>] [--baseline-module <path> | --baseline-ref <git-ref>]\n" +
  "  [--candidate <weights-path>] [--candidate-module <path> | --candidate-ref <git-ref>]\n" +
  "  [--seed <int>] [--seeds <int>] [--concurrency <int>]\n" +
  "  [--output-dir <dir>] [--run-id <id>]\n" +
  "  (--candidate, --candidate-module or --candidate-ref is required)\n";

const parseArguments = (argv: string[]): Arguments => {
  const result: Arguments = {
    seed: 1,
    // Matches tune-cli.ts's --eval-seeds default: enough duplicate-deal pairs
    // (seeds * 2 seat splits) that a real quality difference clears self-play
    // variance instead of being noise (see tune.ts's mutate() doc comment).
    seeds: 15,
    concurrency: defaultConcurrency(),
    outputDir: defaultOutputDir,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || value === undefined) throw new Error("MISSING_ARGUMENT_VALUE");
    if (flag === "--baseline") result.baselineWeightsPath = value;
    else if (flag === "--candidate") result.candidateWeightsPath = value;
    else if (flag === "--baseline-module") result.baselineModule = value;
    else if (flag === "--baseline-ref") result.baselineRef = value;
    else if (flag === "--candidate-module") result.candidateModule = value;
    else if (flag === "--candidate-ref") result.candidateRef = value;
    else if (flag === "--seed") result.seed = Number(value);
    else if (flag === "--seeds") result.seeds = Number(value);
    else if (flag === "--concurrency") result.concurrency = Number(value);
    else if (flag === "--output-dir") result.outputDir = value;
    else if (flag === "--run-id") result.runId = value;
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (!result.candidateWeightsPath && !result.candidateModule && !result.candidateRef) {
    throw new Error("MISSING_CANDIDATE");
  }
  if (
    !Number.isInteger(result.seed) ||
    !Number.isInteger(result.seeds) ||
    result.seeds < 1 ||
    !Number.isInteger(result.concurrency) ||
    result.concurrency < 1
  ) {
    throw new Error("INVALID_NUMERIC_ARGUMENT");
  }
  if (result.runId !== undefined && !/^[a-zA-Z0-9._-]+$/.test(result.runId))
    throw new Error("INVALID_RUN_ID");
  return result;
};

const isCrossVersion = (args: Arguments): boolean =>
  Boolean(args.baselineModule || args.baselineRef || args.candidateModule || args.candidateRef);

/** exactOptionalPropertyTypes rejects `{ ref: undefined }`. */
const policySource = (ref?: string, modulePath?: string): PolicySource => ({
  ...(ref !== undefined ? { ref } : {}),
  ...(modulePath !== undefined ? { modulePath } : {}),
});

const resolvedSource = (
  modulePath: string,
  weightsPath?: string,
): { modulePath: string; weightsPath?: string } => ({
  modulePath,
  ...(weightsPath !== undefined ? { weightsPath } : {}),
});

const formatCompareReport = (
  args: Arguments,
  baselineLabel: string,
  candidateLabel: string,
  seeds: readonly number[],
  result: MatchupResult,
  /** Omitted on the cross-version path — two different code versions may not
   * share a JunkWeights shape (e.g. a renamed field), so there's no meaningful
   * single delta table to print. */
  weightDelta?: string,
): string => {
  const winRate =
    result.totalMatches === 0
      ? "n/a"
      : `${((result.candidateWins / result.totalMatches) * 100).toFixed(1)}%`;
  const verdict =
    result.totalMatches === 0
      ? "no valid matches — cannot judge"
      : result.candidateScore > result.baselineScore
        ? "B (candidate) scored higher than A (baseline)"
        : result.candidateScore < result.baselineScore
          ? "A (baseline) scored higher than B (candidate)"
          : "tied — inconclusive";
  return [
    "=== Junk AI weight A/B comparison ===",
    `A (baseline):  ${baselineLabel}`,
    `B (candidate): ${candidateLabel}`,
    `seed: ${args.seed}  matches: ${result.totalMatches} (${seeds.length} seeds x 2 seat splits)`,
    "",
    `A total score: ${result.baselineScore}   B total score: ${result.candidateScore}`,
    `B win rate: ${winRate}`,
    `verdict: ${verdict}`,
    "",
    ...(weightDelta !== undefined ? ["Weight changes (A -> B):", weightDelta, ""] : []),
    "This tool only writes evaluation reports. Adopt B by hand-copying it over",
    "default-weights.json once the numbers above hold up.",
  ].join("\n");
};

const currentGitSha = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

export const runCompareWeightsCli = async (
  argv: readonly string[],
  log: (line: string) => void = (line) => process.stderr.write(line),
): Promise<{ exitCode: number; output: string }> => {
  if (argv.includes("--help")) return { exitCode: 0, output: usage };
  let weightPool: MatchWorkerPool<MatchTask> | undefined;
  let policyPool: MatchWorkerPool<PolicyMatchTask> | undefined;
  try {
    const args = parseArguments([...argv]);
    const startedAt = new Date();
    const runId = args.runId ?? `run-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    const fileStem = `junk-weights-compare-${runId}`;
    assertTextEvaluationArtifactsAvailable(args.outputDir, fileStem);
    let prng = createPrng(args.seed);
    const seeds: number[] = [];
    for (let index = 0; index < args.seeds; index += 1) {
      const step = nextUint32(prng);
      prng = step.prng;
      seeds.push(step.value);
    }

    const complete = (
      mode: "weights" | "policy",
      baselineLabel: string,
      candidateLabel: string,
      result: MatchupResult,
      weightDelta?: string,
    ): { exitCode: number; output: string } => {
      const report = `${formatCompareReport(
        args,
        baselineLabel,
        candidateLabel,
        seeds,
        result,
        weightDelta,
      )}\n`;
      const paths = writeTextEvaluationArtifacts(
        args.outputDir,
        fileStem,
        {
          run: {
            schemaVersion: 1,
            runId,
            command: `pnpm --filter @new-mj/ai evaluate weights compare ${argv.join(" ")}`.trim(),
            gitSha: currentGitSha(),
            startedAt: startedAt.toISOString(),
          },
          data: {
            mode,
            baseline: baselineLabel,
            candidate: candidateLabel,
            seed: args.seed,
            seeds,
            concurrency: args.concurrency,
            ...result,
          },
        },
        report,
      );
      return {
        exitCode: 0,
        output: `${report}json: ${paths.jsonPath}\ntext: ${paths.textPath}\n`,
      };
    };

    if (!isCrossVersion(args)) {
      const baselinePath = args.baselineWeightsPath ?? DEFAULT_WEIGHTS_PATH.pathname;
      // Guaranteed by parseArguments' validation once isCrossVersion is false
      // (candidateModule/candidateRef are both unset, so candidateWeightsPath
      // must be the one that's set) — a runtime check reads clearer here than a
      // non-null assertion.
      if (!args.candidateWeightsPath) throw new Error("MISSING_CANDIDATE");
      const candidatePath = args.candidateWeightsPath;
      const baseline = loadWeightsFile(baselinePath, WEIGHT_KEYS);
      const candidate = loadWeightsFile(candidatePath, WEIGHT_KEYS);
      log(`[compare] baseline=${baselinePath} candidate=${candidatePath} seeds=${args.seeds}\n`);
      weightPool = new MatchWorkerPool<MatchTask>(
        args.concurrency,
        new URL("../match/tune-worker.ts", import.meta.url),
      );
      const result = await evaluateCandidate(seeds, baseline, candidate, weightPool);
      return complete(
        "weights",
        baselinePath,
        candidatePath,
        result,
        formatWeightDelta(baseline, candidate),
      );
    }

    log(
      `[compare] cross-version comparison (parallel, concurrency=${args.concurrency}), seeds=${args.seeds}\n`,
    );
    // ref snapshots resolve once here, on the main thread — workers only ever
    // import() an already-materialized path, never run git themselves (see
    // policy-loader.ts's resolveModulePath doc comment).
    const baselineModulePath = resolveModulePath(
      policySource(args.baselineRef, args.baselineModule),
    );
    const candidateModulePath = resolveModulePath(
      policySource(args.candidateRef, args.candidateModule),
    );
    policyPool = new MatchWorkerPool<PolicyMatchTask>(
      args.concurrency,
      new URL("../match/policy-match-worker.ts", import.meta.url),
    );
    const result = await evaluateCandidatePolicies(
      seeds,
      resolvedSource(baselineModulePath, args.baselineWeightsPath),
      resolvedSource(candidateModulePath, args.candidateWeightsPath),
      policyPool,
    );
    return complete("policy", baselineModulePath, candidateModulePath, result);
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  } finally {
    await Promise.all([weightPool?.close(), policyPool?.close()]);
  }
};
