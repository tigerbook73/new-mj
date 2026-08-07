import { readFileSync } from "node:fs";
import os from "node:os";
import { createPrng, nextUint32 } from "@new-mj/core";
import { formatWeightDelta, evaluateCandidate, WEIGHT_KEYS, type MatchupResult } from "./tune.ts";
import { MatchWorkerPool } from "./tune-pool.ts";
import type { JunkWeights } from "./strategy.ts";

/**
 * General-purpose A/B primitive for any AI-quality change expressed as weights:
 * unlike tune-cli.ts (which only ever compares a *search-generated* candidate
 * against the incumbent), this compares two arbitrary, hand-specified weight
 * files by self-play — the baseline (A, defaults to the committed
 * default-weights.json) against a candidate (B, any JSON path — e.g. a scratch
 * file holding a hand-edited or externally-produced weight set under
 * evaluation, kept out of git until it clears this comparison). See
 * packages/ai/AGENTS.md "AI 质量调优的 A/B 流程" for when to use this vs.
 * fixture-based regression tests.
 */

type Arguments = {
  baselinePath: string;
  candidatePath: string;
  seed: number;
  seeds: number;
  concurrency: number;
};

const DEFAULT_WEIGHTS_PATH = new URL("./default-weights.json", import.meta.url);

const defaultConcurrency = (): number => {
  try {
    return os.availableParallelism();
  } catch {
    return os.cpus().length || 1;
  }
};

const usage =
  "Usage: junk/compare-weights-cli.ts --candidate <path> [--baseline <path>] " +
  "[--seed <int>] [--seeds <int>] [--concurrency <int>]\n";

const parseArguments = (argv: string[]): Arguments => {
  const result: Arguments = {
    baselinePath: DEFAULT_WEIGHTS_PATH.pathname,
    candidatePath: "",
    seed: 1,
    // Matches tune-cli.ts's --eval-seeds default: enough duplicate-deal pairs
    // (seeds * 2 seat splits) that a real quality difference clears self-play
    // variance instead of being noise (see tune.ts's mutate() doc comment).
    seeds: 15,
    concurrency: defaultConcurrency(),
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || value === undefined) throw new Error("MISSING_ARGUMENT_VALUE");
    if (flag === "--baseline") result.baselinePath = value;
    else if (flag === "--candidate") result.candidatePath = value;
    else if (flag === "--seed") result.seed = Number(value);
    else if (flag === "--seeds") result.seeds = Number(value);
    else if (flag === "--concurrency") result.concurrency = Number(value);
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (!result.candidatePath) throw new Error("MISSING_CANDIDATE_PATH");
  if (
    !Number.isInteger(result.seed) ||
    !Number.isInteger(result.seeds) ||
    result.seeds < 1 ||
    !Number.isInteger(result.concurrency) ||
    result.concurrency < 1
  ) {
    throw new Error("INVALID_NUMERIC_ARGUMENT");
  }
  return result;
};

const loadWeights = (path: string): JunkWeights => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error(`INVALID_WEIGHTS_FILE: ${path}`);
  const keys = Object.keys(parsed).sort();
  if (keys.join(",") !== [...WEIGHT_KEYS].sort().join(",")) {
    throw new Error(`INVALID_WEIGHTS_FILE: ${path} does not have exactly the JunkWeights key set`);
  }
  return parsed as JunkWeights;
};

const formatCompareReport = (
  args: Arguments,
  baseline: JunkWeights,
  candidate: JunkWeights,
  seeds: readonly number[],
  result: MatchupResult,
): string => {
  const winRate =
    result.totalMatches === 0 ? "n/a" : `${((result.candidateWins / result.totalMatches) * 100).toFixed(1)}%`;
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
    `A (baseline):  ${args.baselinePath}`,
    `B (candidate): ${args.candidatePath}`,
    `seed: ${args.seed}  matches: ${result.totalMatches} (${seeds.length} seeds x 2 seat splits)`,
    "",
    `A total score: ${result.baselineScore}   B total score: ${result.candidateScore}`,
    `B win rate: ${winRate}`,
    `verdict: ${verdict}`,
    "",
    "Weight changes (A -> B):",
    formatWeightDelta(baseline, candidate),
    "",
    "This tool never writes any file — it only reports. Adopt B by hand-copying",
    "it over default-weights.json once the numbers above hold up.",
  ].join("\n");
};

export const runCompareWeightsCli = async (
  argv: string[],
  log: (line: string) => void = (line) => process.stderr.write(line),
): Promise<{ exitCode: number; output: string }> => {
  let pool: MatchWorkerPool | undefined;
  try {
    const args = parseArguments(argv);
    const baseline = loadWeights(args.baselinePath);
    const candidate = loadWeights(args.candidatePath);
    log(`[compare] baseline=${args.baselinePath} candidate=${args.candidatePath} seeds=${args.seeds}\n`);
    pool = new MatchWorkerPool(args.concurrency);
    let prng = createPrng(args.seed);
    const seeds: number[] = [];
    for (let index = 0; index < args.seeds; index += 1) {
      const step = nextUint32(prng);
      prng = step.prng;
      seeds.push(step.value);
    }
    const result = await evaluateCandidate(seeds, baseline, candidate, pool);
    return { exitCode: 0, output: `${formatCompareReport(args, baseline, candidate, seeds, result)}\n` };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  } finally {
    await pool?.close();
  }
};

const output = await runCompareWeightsCli(process.argv.slice(2));
process.stdout.write(output.output);
process.exitCode = output.exitCode;
