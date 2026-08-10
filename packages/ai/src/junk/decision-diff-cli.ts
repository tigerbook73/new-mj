import {
  createPrng,
  nextUint32,
  STANDARD_TILE_SET,
  type JunkAction,
  type TileId,
} from "@new-mj/core";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTextEvaluationArtifactsAvailable,
  writeTextEvaluationArtifacts,
  type TextArtifactRuntime,
} from "../evaluation/text-artifacts.ts";
import { loadPolicy, type PolicySource } from "./policy-loader.ts";
import { runDecisionDiff, type DecisionDiffReport, type Divergence } from "./decision-diff.ts";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultOutputDir = path.join(packageRoot, ".evaluation-runs");

/** exactOptionalPropertyTypes rejects `{ ref: undefined }` — build the source
 * object with only the keys the caller actually provided. */
const policySource = (ref?: string, modulePath?: string, weightsPath?: string): PolicySource => ({
  ...(ref !== undefined ? { ref } : {}),
  ...(modulePath !== undefined ? { modulePath } : {}),
  ...(weightsPath !== undefined ? { weightsPath } : {}),
});

type Arguments = {
  baselineRef?: string;
  baselineModule?: string;
  baselineWeights?: string;
  candidateRef?: string;
  candidateModule?: string;
  candidateWeights?: string;
  seed: number;
  seeds: number;
  sampleSize: number;
  outputDir: string;
  runId?: string;
};

const usage =
  "Usage: pnpm --filter @new-mj/ai evaluate policy diff\n" +
  "  [--baseline-ref <git-ref> | --baseline-module <path>] [--baseline-weights <path>]\n" +
  "  [--candidate-ref <git-ref> | --candidate-module <path>] [--candidate-weights <path>]\n" +
  "  [--seed <int>] [--seeds <int>] [--sample-size <int>]\n" +
  "  [--output-dir <dir>] [--run-id <id>]\n";

const parseArguments = (argv: string[]): Arguments => {
  const result: Arguments = { seed: 1, seeds: 20, sampleSize: 20, outputDir: defaultOutputDir };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || value === undefined) throw new Error("MISSING_ARGUMENT_VALUE");
    if (flag === "--baseline-ref") result.baselineRef = value;
    else if (flag === "--baseline-module") result.baselineModule = value;
    else if (flag === "--baseline-weights") result.baselineWeights = value;
    else if (flag === "--candidate-ref") result.candidateRef = value;
    else if (flag === "--candidate-module") result.candidateModule = value;
    else if (flag === "--candidate-weights") result.candidateWeights = value;
    else if (flag === "--seed") result.seed = Number(value);
    else if (flag === "--seeds") result.seeds = Number(value);
    else if (flag === "--sample-size") result.sampleSize = Number(value);
    else if (flag === "--output-dir") result.outputDir = value;
    else if (flag === "--run-id") result.runId = value;
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (
    !Number.isInteger(result.seed) ||
    !Number.isInteger(result.seeds) ||
    result.seeds < 1 ||
    !Number.isInteger(result.sampleSize) ||
    result.sampleSize < 0
  ) {
    throw new Error("INVALID_NUMERIC_ARGUMENT");
  }
  if (result.runId !== undefined && !/^[a-zA-Z0-9._-]+$/.test(result.runId))
    throw new Error("INVALID_RUN_ID");
  return result;
};

const kindOf = (tile: TileId): string => STANDARD_TILE_SET.kindOf(tile);

const readableHand = (hand: readonly TileId[]): string => [...hand].map(kindOf).sort().join(",");

const readableAction = (action: JunkAction): string => {
  if (action.type === "discard") return `discard ${kindOf(action.tile)}`;
  if (action.type === "buGang") return `buGang ${kindOf(action.tile)}`;
  if (action.type === "anGang") return `anGang ${action.kind}`;
  if (action.type === "chi") return `chi ${action.tiles.map(kindOf).join("+")}`;
  return action.type;
};

const formatDivergence = (divergence: Divergence, index: number): string[] => {
  const own = divergence.view.seats[divergence.view.seat];
  const other = divergence.driver === "baseline" ? "candidate" : "baseline";
  return [
    `[#${index + 1}] seed=${divergence.seed} round=${divergence.round} step=${divergence.step} ` +
      `seat=${divergence.seat} driver=${divergence.driver}`,
    `  view: wallCount=${divergence.view.wallCount} phase=${divergence.view.phase} ` +
      `melds=${own?.melds.length ?? 0} hand=[${readableHand(divergence.view.hand)}]`,
    `  ${divergence.driver} chose: ${readableAction(divergence.driverAction)}`,
    `  ${other} would choose: ${readableAction(divergence.otherAction)}`,
    "",
  ];
};

const formatReport = (
  args: Arguments,
  baseline: { label: string; modulePath: string },
  candidate: { label: string; modulePath: string },
  seeds: readonly number[],
  decisionPoints: number,
  divergences: readonly Divergence[],
): string => {
  const divergenceRate =
    decisionPoints === 0 ? "n/a" : `${((divergences.length / decisionPoints) * 100).toFixed(1)}%`;
  const byType = new Map<string, number>();
  for (const divergence of divergences) {
    byType.set(divergence.driverAction.type, (byType.get(divergence.driverAction.type) ?? 0) + 1);
  }
  const byTypeLines = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `  ${type}: ${count}`);
  const sample = divergences.slice(0, args.sampleSize);
  return [
    "=== Junk AI decision-diff report ===",
    `baseline:  ${baseline.label} (${baseline.modulePath})`,
    `candidate: ${candidate.label} (${candidate.modulePath})`,
    `seed: ${args.seed}  seeds: ${seeds.length}  sample-size: ${args.sampleSize}`,
    "",
    `decision points evaluated: ${decisionPoints}`,
    `divergences: ${divergences.length} (${divergenceRate})`,
    "divergences by action type:",
    ...(byTypeLines.length > 0 ? byTypeLines : ["  (none)"]),
    "",
    `--- sample divergences (up to ${args.sampleSize} of ${divergences.length}) ---`,
    ...sample.flatMap((divergence, index) => formatDivergence(divergence, index)),
    "This tool only writes evaluation reports. Adopting the candidate remains a",
    "manual decision made after reading this report, never automatic.",
  ].join("\n");
};

type Runtime = TextArtifactRuntime &
  Readonly<{
    now?: () => Date;
    gitSha?: string;
    load?: typeof loadPolicy;
    evaluate?: (
      seeds: readonly number[],
      baseline: Parameters<typeof runDecisionDiff>[1],
      candidate: Parameters<typeof runDecisionDiff>[2],
    ) => DecisionDiffReport;
  }>;

const currentGitSha = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

export const runDecisionDiffCli = async (
  argv: readonly string[],
  log: (line: string) => void = (line) => process.stderr.write(line),
  runtime: Runtime = {},
): Promise<{ exitCode: number; output: string }> => {
  if (argv.includes("--help")) return { exitCode: 0, output: usage };
  try {
    const args = parseArguments([...argv]);
    const startedAt = (runtime.now ?? (() => new Date()))();
    const runId = args.runId ?? `run-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    const fileStem = `junk-policy-diff-${runId}`;
    assertTextEvaluationArtifactsAvailable(args.outputDir, fileStem, runtime);
    log(`[decision-diff] loading baseline/candidate policies (seeds=${args.seeds})...\n`);
    const load = runtime.load ?? loadPolicy;
    const [baseline, candidate] = await Promise.all([
      load(policySource(args.baselineRef, args.baselineModule, args.baselineWeights), "baseline"),
      load(
        policySource(args.candidateRef, args.candidateModule, args.candidateWeights),
        "candidate",
      ),
    ]);
    let prng = createPrng(args.seed);
    const seeds: number[] = [];
    for (let index = 0; index < args.seeds; index += 1) {
      const step = nextUint32(prng);
      prng = step.prng;
      seeds.push(step.value);
    }
    log("[decision-diff] running self-play (both directions driving)...\n");
    const { decisionPoints, divergences } = (runtime.evaluate ?? runDecisionDiff)(
      seeds,
      baseline.policy,
      candidate.policy,
    );
    const report = `${formatReport(args, baseline, candidate, seeds, decisionPoints, divergences)}\n`;
    const paths = writeTextEvaluationArtifacts(
      args.outputDir,
      fileStem,
      {
        run: {
          schemaVersion: 1,
          runId,
          command: `pnpm --filter @new-mj/ai evaluate policy diff ${argv.join(" ")}`.trim(),
          gitSha: runtime.gitSha ?? currentGitSha(),
          startedAt: startedAt.toISOString(),
        },
        data: {
          baseline: { label: baseline.label, modulePath: baseline.modulePath },
          candidate: { label: candidate.label, modulePath: candidate.modulePath },
          seed: args.seed,
          seeds,
          sampleSize: args.sampleSize,
          decisionPoints,
          divergenceCount: divergences.length,
        },
      },
      report,
      runtime,
    );
    return {
      exitCode: 0,
      output: `${report}json: ${paths.jsonPath}\ntext: ${paths.textPath}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  }
};
