import {
  createPrng,
  nextUint32,
  STANDARD_TILE_SET,
  type JunkAction,
  type TileId,
} from "@new-mj/core";
import { loadPolicy, type PolicySource } from "./policy-loader.ts";
import { runDecisionDiff, type Divergence } from "./decision-diff.ts";

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
};

const usage =
  "Usage: junk/decision-diff-cli.ts\n" +
  "  [--baseline-ref <git-ref> | --baseline-module <path>] [--baseline-weights <path>]\n" +
  "  [--candidate-ref <git-ref> | --candidate-module <path>] [--candidate-weights <path>]\n" +
  "  [--seed <int>] [--seeds <int>] [--sample-size <int>]\n";

const parseArguments = (argv: string[]): Arguments => {
  const result: Arguments = { seed: 1, seeds: 20, sampleSize: 20 };
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
    "This tool never writes any file — it only reports. Adopting the candidate is",
    "a manual decision made after reading this report, never automatic.",
  ].join("\n");
};

export const runDecisionDiffCli = async (
  argv: string[],
  log: (line: string) => void = (line) => process.stderr.write(line),
): Promise<{ exitCode: number; output: string }> => {
  try {
    const args = parseArguments(argv);
    log(`[decision-diff] loading baseline/candidate policies (seeds=${args.seeds})...\n`);
    const [baseline, candidate] = await Promise.all([
      loadPolicy(
        policySource(args.baselineRef, args.baselineModule, args.baselineWeights),
        "baseline",
      ),
      loadPolicy(
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
    const { decisionPoints, divergences } = runDecisionDiff(
      seeds,
      baseline.policy,
      candidate.policy,
    );
    return {
      exitCode: 0,
      output: `${formatReport(args, baseline, candidate, seeds, decisionPoints, divergences)}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  }
};

const output = await runDecisionDiffCli(process.argv.slice(2));
process.stdout.write(output.output);
process.exitCode = output.exitCode;
