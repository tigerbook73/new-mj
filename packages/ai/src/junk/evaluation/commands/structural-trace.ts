import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STANDARD_TILE_SET, type JunkAction, type JunkPlayerView, type SeatId } from "@new-mj/core";
import {
  assertTextEvaluationArtifactsAvailable,
  writeTextEvaluationArtifacts,
  type TextArtifactRuntime,
} from "../../../evaluation/text-artifacts.ts";
import { chooseJunkAction, recommendStructuralJunkAction } from "../../strategy.ts";
import { playJunkMatch, strengthPolicy, type SeatPolicy } from "../match/arena.ts";

type Split = "structural-even" | "structural-odd";

export type StructuralTraceDivergence = Readonly<{
  seed: number;
  split: Split;
  round: number;
  step: number;
  seat: SeatId;
  driver: "weighted" | "structural";
  view: JunkPlayerView;
  legalActions: readonly JunkAction[];
  weightedAction: JunkAction;
  structuralAction: JunkAction;
}>;

export type StructuralTraceResult = Readonly<{
  matches: readonly Readonly<{
    split: Split;
    structuralScore?: number;
    weightedScore?: number;
    error?: string;
  }>[];
  decisionPoints: number;
  divergences: readonly StructuralTraceDivergence[];
}>;

type Arguments = { seed: number; rounds: number; outputDir: string; runId?: string };
type Runtime = TextArtifactRuntime &
  Readonly<{
    now?: () => Date;
    gitSha?: () => string;
    evaluate?: (seed: number, rounds: number) => StructuralTraceResult;
  }>;

const packageRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const defaultOutputDir = path.join(packageRoot, ".evaluation-runs");
const usage =
  "Usage: pnpm --filter @new-mj/ai evaluate structural trace " +
  "--seed <int> [--rounds <int>] [--output-dir <dir>] [--run-id <id>]\n";

const parseArguments = (argv: readonly string[]): Arguments => {
  const result: Arguments = { seed: Number.NaN, rounds: 4, outputDir: defaultOutputDir };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || value === undefined) throw new Error("MISSING_ARGUMENT_VALUE");
    if (flag === "--seed") result.seed = Number(value);
    else if (flag === "--rounds") result.rounds = Number(value);
    else if (flag === "--output-dir") result.outputDir = value;
    else if (flag === "--run-id") result.runId = value;
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (!Number.isInteger(result.seed) || !Number.isInteger(result.rounds) || result.rounds < 1)
    throw new Error("INVALID_NUMERIC_ARGUMENT");
  if (result.runId !== undefined && !/^[a-zA-Z0-9._-]+$/.test(result.runId))
    throw new Error("INVALID_RUN_ID");
  return result;
};

const actionsEqual = (left: JunkAction, right: JunkAction): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const structuralPolicy = (): SeatPolicy =>
  ((view, legalActions) => {
    const action = recommendStructuralJunkAction(view, legalActions);
    if (!action) throw new Error("structural policy called with no legal actions");
    return action;
  }) as SeatPolicy;

export const evaluateStructuralTrace = (seed: number, rounds: number): StructuralTraceResult => {
  const matches: Array<StructuralTraceResult["matches"][number]> = [];
  const divergences: StructuralTraceDivergence[] = [];
  let decisionPoints = 0;
  for (const split of ["structural-even", "structural-odd"] as const) {
    const structuralSeats: readonly SeatId[] = split === "structural-even" ? [0, 2] : [1, 3];
    const policies = [0, 1, 2, 3].map((seat) =>
      structuralSeats.includes(seat as SeatId) ? structuralPolicy() : strengthPolicy(),
    ) as [SeatPolicy, SeatPolicy, SeatPolicy, SeatPolicy];
    const result = playJunkMatch(seed, policies, rounds, (info) => {
      decisionPoints += 1;
      const weightedAction = chooseJunkAction(info.view, info.legalActions);
      const structuralAction = recommendStructuralJunkAction(info.view, info.legalActions);
      if (!structuralAction) throw new Error("structural shadow called with no legal actions");
      const driver = structuralSeats.includes(info.seat) ? "structural" : "weighted";
      const expectedDriverAction = driver === "structural" ? structuralAction : weightedAction;
      if (!actionsEqual(info.action, expectedDriverAction))
        throw new Error("DRIVER_ACTION_MISMATCH");
      if (!actionsEqual(weightedAction, structuralAction)) {
        divergences.push({
          seed,
          split,
          round: info.round,
          step: info.step,
          seat: info.seat,
          driver,
          view: info.view,
          legalActions: info.legalActions,
          weightedAction,
          structuralAction,
        });
      }
    });
    if ("error" in result) {
      matches.push({ split, error: result.error });
      continue;
    }
    const structuralScore = structuralSeats.reduce<number>(
      (sum, seat) => sum + result.scores[seat],
      0,
    );
    matches.push({ split, structuralScore, weightedScore: -structuralScore });
  }
  return { matches, decisionPoints, divergences };
};

const kindOf = (tile: number): string => STANDARD_TILE_SET.kindOf(tile);
const readableAction = (action: JunkAction): string => {
  if (action.type === "discard") return `discard ${kindOf(action.tile)}`;
  if (action.type === "buGang") return `buGang ${kindOf(action.tile)}`;
  if (action.type === "anGang") return `anGang ${action.kind}`;
  if (action.type === "chi") return `chi ${action.tiles.map(kindOf).join("+")}`;
  return action.type;
};

const formatReport = (args: Arguments, result: StructuralTraceResult): string => {
  const byPair = new Map<string, number>();
  const byPhase = new Map<string, number>();
  for (const divergence of result.divergences) {
    const pair = `${divergence.weightedAction.type}->${divergence.structuralAction.type}`;
    byPair.set(pair, (byPair.get(pair) ?? 0) + 1);
    byPhase.set(divergence.view.phase, (byPhase.get(divergence.view.phase) ?? 0) + 1);
  }
  const sortedLines = (values: Map<string, number>) =>
    [...values.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([key, count]) => `  ${key}: ${count}`);
  const sample = result.divergences
    .slice(0, 10)
    .flatMap((divergence, index) => [
      `[#${index + 1}] split=${divergence.split} round=${divergence.round} step=${divergence.step} seat=${divergence.seat} driver=${divergence.driver}`,
      `  phase=${divergence.view.phase} hand=[${divergence.view.hand.map(kindOf).sort().join(",")}]`,
      `  weighted=${readableAction(divergence.weightedAction)} structural=${readableAction(divergence.structuralAction)}`,
    ]);
  return [
    "=== Junk ordinary structural decision trace ===",
    `seed: ${args.seed}  rounds/match: ${args.rounds}  decision points: ${result.decisionPoints}`,
    `divergences: ${result.divergences.length}`,
    ...result.matches.map(
      (match) =>
        `${match.split}: ${match.error ?? `structural=${match.structuralScore} weighted=${match.weightedScore}`}`,
    ),
    "",
    "by phase:",
    ...sortedLines(byPhase),
    "by weighted->structural action type:",
    ...sortedLines(byPair),
    "",
    "first 10 divergences:",
    ...sample,
    "",
    "The JSON artifact contains complete PlayerView/legalActions for every divergence.",
    "A shadow recommendation is comparable at that node but does not define the later trajectory.",
  ].join("\n");
};

const currentGitSha = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

export const runStructuralTraceCli = async (
  argv: readonly string[],
  runtime: Runtime = {},
): Promise<{ exitCode: number; output: string }> => {
  if (argv.includes("--help")) return { exitCode: 0, output: usage };
  try {
    const args = parseArguments(argv);
    const startedAt = (runtime.now ?? (() => new Date()))();
    const runId = args.runId ?? `run-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    const fileStem = `junk-structural-trace-${runId}`;
    assertTextEvaluationArtifactsAvailable(args.outputDir, fileStem, runtime);
    const result = (runtime.evaluate ?? evaluateStructuralTrace)(args.seed, args.rounds);
    const report = `${formatReport(args, result)}\n`;
    const paths = writeTextEvaluationArtifacts(
      args.outputDir,
      fileStem,
      {
        run: {
          schemaVersion: 1,
          runId,
          command: `pnpm --filter @new-mj/ai evaluate structural trace ${argv.join(" ")}`.trim(),
          gitSha: (runtime.gitSha ?? currentGitSha)(),
          startedAt: startedAt.toISOString(),
        },
        data: { seed: args.seed, rounds: args.rounds, ...result },
      },
      report,
      runtime,
    );
    const failed = result.matches.some((match) => match.error !== undefined);
    return {
      exitCode: failed ? 2 : 0,
      output: `${report}json: ${paths.jsonPath}\ntext: ${paths.textPath}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  }
};
