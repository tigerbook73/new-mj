import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrng, nextUint32, type SeatId } from "@new-mj/core";
import {
  assertTextEvaluationArtifactsAvailable,
  writeTextEvaluationArtifacts,
  type TextArtifactRuntime,
} from "../../../evaluation/text-artifacts.ts";
import {
  classifyOrdinaryStructuralGate,
  recommendStructuralJunkAction,
  type OrdinaryStructuralGateRoute,
} from "../../strategy.ts";
import { legacyWeightedPolicy, playJunkMatch, type SeatPolicy } from "../match/arena.ts";

type Arguments = {
  seed: number;
  seeds: number;
  rounds: number;
  component: StructuralComponent;
  outputDir: string;
  runId?: string;
};

type TimedPolicy = Readonly<{ policy: SeatPolicy; timingsMs: number[] }>;
type Split = "structural-even" | "structural-odd";
export type StructuralComponent = "all" | "turn" | "claim";
type RouteDecisionCounts = Record<OrdinaryStructuralGateRoute, number>;

export type StructuralCompareMatch = Readonly<{
  seed: number;
  split: Split;
  structuralScore?: number;
  weightedScore?: number;
  error?: string;
}>;

export type StructuralCompareResult = Readonly<{
  component: StructuralComponent;
  matches: StructuralCompareMatch[];
  structuralScore: number;
  weightedScore: number;
  structuralWins: number;
  weightedWins: number;
  ties: number;
  failures: number;
  stepLimitFailures: number;
  structuralLatency: LatencySummary;
  weightedLatency: LatencySummary;
  routeDecisions: RouteDecisionCounts;
  splitScores: Record<Split, number>;
}>;

type LatencySummary = Readonly<{
  samples: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}>;

type Runtime = TextArtifactRuntime &
  Readonly<{
    now?: () => Date;
    monotonicNow?: () => number;
    gitSha?: () => string;
    evaluate?: (
      seeds: readonly number[],
      rounds: number,
      now?: () => number,
      component?: StructuralComponent,
    ) => StructuralCompareResult;
  }>;

const packageRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const defaultOutputDir = path.join(packageRoot, ".evaluation-runs");
const usage =
  "Usage: pnpm --filter @new-mj/ai evaluate structural compare " +
  "[--seed <int>] [--seeds <int>] [--rounds <int>] [--component <all|turn|claim>] " +
  "[--output-dir <dir>] [--run-id <id>]\n";

const parseArguments = (argv: readonly string[]): Arguments => {
  const result: Arguments = {
    seed: 1,
    seeds: 15,
    rounds: 4,
    component: "all",
    outputDir: defaultOutputDir,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || value === undefined) throw new Error("MISSING_ARGUMENT_VALUE");
    if (flag === "--seed") result.seed = Number(value);
    else if (flag === "--seeds") result.seeds = Number(value);
    else if (flag === "--rounds") result.rounds = Number(value);
    else if (flag === "--component" && ["all", "turn", "claim"].includes(value))
      result.component = value as StructuralComponent;
    else if (flag === "--output-dir") result.outputDir = value;
    else if (flag === "--run-id") result.runId = value;
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (
    !Number.isInteger(result.seed) ||
    !Number.isInteger(result.seeds) ||
    result.seeds < 1 ||
    !Number.isInteger(result.rounds) ||
    result.rounds < 1
  )
    throw new Error("INVALID_NUMERIC_ARGUMENT");
  if (result.runId !== undefined && !/^[a-zA-Z0-9._-]+$/.test(result.runId))
    throw new Error("INVALID_RUN_ID");
  return result;
};

const percentile = (sorted: readonly number[], fraction: number): number | null =>
  sorted.length === 0 ? null : sorted[Math.ceil(sorted.length * fraction) - 1]!;

const summarizeLatency = (values: readonly number[]): LatencySummary => {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    samples: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? null,
  };
};

const timedPolicy = (policy: SeatPolicy, now: () => number): TimedPolicy => {
  const timingsMs: number[] = [];
  const timed = ((view, legalActions) => {
    const started = now();
    const action = policy(view, legalActions);
    timingsMs.push(now() - started);
    return action;
  }) as SeatPolicy;
  if (policy.resetAnalysisContext) timed.resetAnalysisContext = policy.resetAnalysisContext;
  return { policy: timed, timingsMs };
};

const emptyRouteDecisionCounts = (): RouteDecisionCounts => ({
  "ordinary-standard": 0,
  "seven-pairs": 0,
  "other-special": 0,
  ambiguous: 0,
});

const isClaimContext = (legalActions: readonly { type: string }[]): boolean =>
  legalActions.some((action) => ["chi", "peng", "minGang", "hu", "pass"].includes(action.type));

const structuralPolicy = (
  routeDecisions: RouteDecisionCounts,
  component: StructuralComponent,
): SeatPolicy => {
  const weighted = legacyWeightedPolicy();
  const policy = ((view, legalActions) => {
    const isRouteDecision =
      legalActions.length > 1 &&
      !legalActions.some((action) => ["hu", "zimo", "draw"].includes(action.type));
    if (isRouteDecision) {
      const classification = classifyOrdinaryStructuralGate(view);
      routeDecisions[classification.route] += 1;
      if (classification.route !== "ordinary-standard") return weighted(view, legalActions);
      const claimContext = isClaimContext(legalActions);
      if ((component === "turn" && claimContext) || (component === "claim" && !claimContext))
        return weighted(view, legalActions);
    }
    const action = recommendStructuralJunkAction(view, legalActions);
    if (!action) throw new Error("structural policy called with no legal actions");
    return action;
  }) as SeatPolicy;
  if (weighted.resetAnalysisContext) policy.resetAnalysisContext = weighted.resetAnalysisContext;
  return policy;
};

export const evaluateStructuralCompare = (
  seeds: readonly number[],
  rounds: number,
  now: () => number = () => performance.now(),
  component: StructuralComponent = "all",
): StructuralCompareResult => {
  const matches: StructuralCompareMatch[] = [];
  const structuralTimings: number[] = [];
  const weightedTimings: number[] = [];
  let structuralScore = 0;
  let weightedScore = 0;
  let structuralWins = 0;
  let weightedWins = 0;
  let ties = 0;
  const routeDecisions = emptyRouteDecisionCounts();
  const splitScores: Record<Split, number> = { "structural-even": 0, "structural-odd": 0 };

  for (const seed of seeds) {
    for (const split of ["structural-even", "structural-odd"] as const) {
      const structural = timedPolicy(structuralPolicy(routeDecisions, component), now);
      const weighted = timedPolicy(legacyWeightedPolicy(), now);
      const structuralSeats: readonly SeatId[] = split === "structural-even" ? [0, 2] : [1, 3];
      const policies = [0, 1, 2, 3].map((seat) =>
        structuralSeats.includes(seat as SeatId) ? structural.policy : weighted.policy,
      ) as [SeatPolicy, SeatPolicy, SeatPolicy, SeatPolicy];
      const result = playJunkMatch(seed, policies, rounds);
      structuralTimings.push(...structural.timingsMs);
      weightedTimings.push(...weighted.timingsMs);
      if ("error" in result) {
        matches.push({ seed, split, error: result.error });
        continue;
      }
      const candidate = structuralSeats.reduce<number>((sum, seat) => sum + result.scores[seat], 0);
      const baseline = -candidate;
      structuralScore += candidate;
      splitScores[split] += candidate;
      weightedScore += baseline;
      if (candidate > baseline) structuralWins += 1;
      else if (candidate < baseline) weightedWins += 1;
      else ties += 1;
      matches.push({ seed, split, structuralScore: candidate, weightedScore: baseline });
    }
  }

  const failures = matches.filter((match) => match.error !== undefined);
  return {
    component,
    matches,
    structuralScore,
    weightedScore,
    structuralWins,
    weightedWins,
    ties,
    failures: failures.length,
    stepLimitFailures: failures.filter((match) => match.error === "STEP_LIMIT_EXCEEDED").length,
    structuralLatency: summarizeLatency(structuralTimings),
    weightedLatency: summarizeLatency(weightedTimings),
    routeDecisions,
    splitScores,
  };
};

const formatLatency = (value: number | null): string => (value === null ? "n/a" : value.toFixed(3));

const formatReport = (args: Arguments, seeds: readonly number[], result: StructuralCompareResult) =>
  [
    "=== Junk route-gated ordinary structural A/B ===",
    `component: ${result.component}`,
    `seed: ${args.seed}  matches: ${result.matches.length} (${seeds.length} seeds x 2 seat splits)  rounds/match: ${args.rounds}`,
    `failures: ${result.failures}  step-limit failures: ${result.stepLimitFailures}`,
    "",
    `weighted score: ${result.weightedScore}  structural score: ${result.structuralScore}`,
    `structural/weighted/tied matches: ${result.structuralWins}/${result.weightedWins}/${result.ties}`,
    `candidate split scores: even=${result.splitScores["structural-even"]}  odd=${result.splitScores["structural-odd"]}`,
    `route decisions: ordinary=${result.routeDecisions["ordinary-standard"]}  seven-pairs=${result.routeDecisions["seven-pairs"]}  other-special=${result.routeDecisions["other-special"]}  ambiguous=${result.routeDecisions.ambiguous}`,
    "",
    "policy      samples  p50 ms  p95 ms  max ms",
    `weighted    ${result.weightedLatency.samples}  ${formatLatency(result.weightedLatency.p50Ms)}  ${formatLatency(result.weightedLatency.p95Ms)}  ${formatLatency(result.weightedLatency.maxMs)}`,
    `structural  ${result.structuralLatency.samples}  ${formatLatency(result.structuralLatency.p50Ms)}  ${formatLatency(result.structuralLatency.p95Ms)}  ${formatLatency(result.structuralLatency.maxMs)}`,
    "",
    "Wall-clock latency is comparable only within this single-concurrency run on the same machine.",
    "Only the selected component of ordinary-standard decisions uses structural play; all others use weighted fallback.",
    "This report does not change production policy and does not prove win probability or terminal EV.",
  ].join("\n");

const currentGitSha = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

export const runStructuralCompareCli = async (
  argv: readonly string[],
  runtime: Runtime = {},
): Promise<{ exitCode: number; output: string }> => {
  if (argv.includes("--help")) return { exitCode: 0, output: usage };
  try {
    const args = parseArguments(argv);
    const startedAt = (runtime.now ?? (() => new Date()))();
    const runId = args.runId ?? `run-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    const fileStem = `junk-structural-compare-${runId}`;
    assertTextEvaluationArtifactsAvailable(args.outputDir, fileStem, runtime);
    let prng = createPrng(args.seed);
    const seeds: number[] = [];
    for (let index = 0; index < args.seeds; index += 1) {
      const step = nextUint32(prng);
      prng = step.prng;
      seeds.push(step.value);
    }
    const result = (runtime.evaluate ?? evaluateStructuralCompare)(
      seeds,
      args.rounds,
      runtime.monotonicNow,
      args.component,
    );
    const report = `${formatReport(args, seeds, result)}\n`;
    const paths = writeTextEvaluationArtifacts(
      args.outputDir,
      fileStem,
      {
        run: {
          schemaVersion: 1,
          runId,
          command: `pnpm --filter @new-mj/ai evaluate structural compare ${argv.join(" ")}`.trim(),
          gitSha: (runtime.gitSha ?? currentGitSha)(),
          startedAt: startedAt.toISOString(),
        },
        data: { seed: args.seed, seeds, rounds: args.rounds, ...result },
      },
      report,
      runtime,
    );
    return {
      exitCode: result.failures === 0 ? 0 : 2,
      output: `${report}json: ${paths.jsonPath}\ntext: ${paths.textPath}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  }
};
