import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrng, nextUint32, SEAT_IDS } from "@new-mj/core";
import {
  assertTextEvaluationArtifactsAvailable,
  writeTextEvaluationArtifacts,
  type TextArtifactRuntime,
} from "../../../evaluation/text-artifacts.ts";
import { type ArenaTask, type ArenaTaskResult } from "../match/arena-worker.ts";
import { MatchWorkerPool } from "../match/tune-pool.ts";

type Arguments = {
  seed: number;
  matches: number;
  rounds: number;
  concurrency: number;
  outputDir: string;
  runId?: string;
};

type ArenaPool = Pick<MatchWorkerPool<ArenaTask, ArenaTaskResult>, "runAll" | "close">;

type ArenaCliRuntime = TextArtifactRuntime &
  Readonly<{
    now?: () => Date;
    gitSha?: () => string;
    createPool?: (concurrency: number) => ArenaPool;
  }>;

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
  "Usage: pnpm --filter @new-mj/ai evaluate arena run " +
  "[--seed <int>] [--matches <int>] [--rounds <int>] [--concurrency <int>] " +
  "[--output-dir <dir>] [--run-id <id>]\n";

const parseArguments = (argv: readonly string[]): Arguments => {
  const result: Arguments = {
    seed: 1,
    matches: 20,
    rounds: 4,
    concurrency: defaultConcurrency(),
    outputDir: defaultOutputDir,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || value === undefined) throw new Error("MISSING_ARGUMENT_VALUE");
    if (flag === "--seed") result.seed = Number(value);
    else if (flag === "--matches") result.matches = Number(value);
    else if (flag === "--rounds") result.rounds = Number(value);
    else if (flag === "--concurrency") result.concurrency = Number(value);
    else if (flag === "--output-dir") result.outputDir = value;
    else if (flag === "--run-id") result.runId = value;
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (
    !Number.isInteger(result.seed) ||
    !Number.isInteger(result.matches) ||
    result.matches < 1 ||
    !Number.isInteger(result.rounds) ||
    result.rounds < 1 ||
    !Number.isInteger(result.concurrency) ||
    result.concurrency < 1
  ) {
    throw new Error("INVALID_NUMERIC_ARGUMENT");
  }
  if (result.runId !== undefined && !/^[a-zA-Z0-9._-]+$/.test(result.runId))
    throw new Error("INVALID_RUN_ID");
  return result;
};

const currentGitSha = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

const formatArenaReport = (
  args: Arguments,
  successful: number,
  failures: number,
  totalScores: readonly number[],
  placements: readonly (readonly number[])[],
): string =>
  [
    "=== Junk AI arena report ===",
    `seed: ${args.seed}  matches: ${successful}/${args.matches} successful  rounds/match: ${args.rounds}`,
    `failures: ${failures}  concurrency: ${args.concurrency}`,
    "",
    "seat  total score  1st  2nd  3rd  4th",
    ...SEAT_IDS.map(
      (seat) =>
        `${seat}     ${String(totalScores[seat]).padStart(11)}  ${placements[seat]!.join("    ")}`,
    ),
    "",
    "All seats use the same production Junk policy; this report validates the arena pipeline",
    "and exposes seat/deal bias. It is not evidence that one strategy is stronger than another.",
  ].join("\n");

export const runArenaCli = async (
  argv: readonly string[],
  runtime: ArenaCliRuntime = {},
): Promise<{ exitCode: number; output: string }> => {
  if (argv.includes("--help")) return { exitCode: 0, output: usage };
  let pool: ArenaPool | undefined;
  try {
    const args = parseArguments(argv);
    const startedAt = (runtime.now ?? (() => new Date()))();
    const runId = args.runId ?? `run-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    const fileStem = `junk-arena-${runId}`;
    assertTextEvaluationArtifactsAvailable(args.outputDir, fileStem, runtime);

    let prng = createPrng(args.seed);
    const tasks: ArenaTask[] = [];
    for (let index = 0; index < args.matches; index += 1) {
      const step = nextUint32(prng);
      prng = step.prng;
      tasks.push({ seed: step.value, rounds: args.rounds });
    }
    pool = runtime.createPool
      ? runtime.createPool(args.concurrency)
      : new MatchWorkerPool<ArenaTask, ArenaTaskResult>(
          args.concurrency,
          new URL("../match/arena-worker.ts", import.meta.url),
          (error) => ({ ok: false, seed: 0, error: String(error) }),
        );
    const results = await pool.runAll(tasks);
    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);
    const totalScores: [number, number, number, number] = [0, 0, 0, 0];
    const placements: [number[], number[], number[], number[]] = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    for (const result of successes) {
      for (const seat of SEAT_IDS) totalScores[seat] = totalScores[seat] + result.scores[seat];
      result.ranking.forEach((seat, place) => {
        placements[seat][place] = (placements[seat][place] ?? 0) + 1;
      });
    }
    const report = `${formatArenaReport(
      args,
      successes.length,
      failures.length,
      totalScores,
      placements,
    )}\n`;
    const paths = writeTextEvaluationArtifacts(
      args.outputDir,
      fileStem,
      {
        run: {
          schemaVersion: 1,
          runId,
          command: `pnpm --filter @new-mj/ai evaluate arena run ${argv.join(" ")}`.trim(),
          gitSha: (runtime.gitSha ?? currentGitSha)(),
          startedAt: startedAt.toISOString(),
        },
        data: {
          seed: args.seed,
          matches: args.matches,
          rounds: args.rounds,
          concurrency: args.concurrency,
          seeds: tasks.map((task) => task.seed),
          successfulMatches: successes.length,
          failures,
          totalScores,
          placements,
        },
      },
      report,
      runtime,
    );
    return { exitCode: 0, output: `${report}json: ${paths.jsonPath}\ntext: ${paths.textPath}\n` };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  } finally {
    await pool?.close();
  }
};
