import { cpus } from "node:os";
import { Worker } from "node:worker_threads";
import { DEFAULT_JUNK_WEIGHTS } from "./strategy.ts";
import {
  BENCHMARK_PROGRESS,
  benchmarkInputs,
  evaluateSelfDrawTwoPlyCandidates,
  type SelfDrawTwoPlyCandidateEvaluation,
} from "./two-ply-benchmark.ts";

export const TWO_PLY_BASELINE_VERSION = 2;
export const TWO_PLY_BASELINE_SEED = 0x2f_2a1e;
export const TWO_PLY_BASELINE_NUMERIC_PRECISION = 9;
export const DEFAULT_BASELINE_WORKERS = Math.min(8, Math.max(1, cpus().length - 1));

export type TwoPlyBaselineCandidate = Readonly<{
  discard: number;
  kind: string;
  onePlyScore: number;
  twoPlyValue: number;
  continuationProbability: number;
  winProbability: number;
  outcomeCount: number;
}>;

export type TwoPlyBaselineCase = Readonly<{
  index: number;
  hand: readonly number[];
  melds: readonly unknown[];
  visibleDiscards: readonly number[];
  wallCount: number;
  unseenPoolSize: number;
  candidates: readonly TwoPlyBaselineCandidate[];
  bestKind: string | undefined;
  bestValue: number | undefined;
}>;

export type TwoPlyBaselineManifest = Readonly<{
  format: "new-mj.junk-two-ply-baseline-manifest";
  version: number;
  generatedAt: string;
  gitRevision: string;
  seed: number;
  count: number;
  workers: number;
  numericPrecision: number;
  progress: typeof BENCHMARK_PROGRESS;
  weights: typeof DEFAULT_JUNK_WEIGHTS;
}>;

const roundBaselineNumber = (value: number | undefined): number | undefined =>
  value === undefined
    ? undefined
    : Math.round(value * 10 ** TWO_PLY_BASELINE_NUMERIC_PRECISION) /
      10 ** TWO_PLY_BASELINE_NUMERIC_PRECISION;

export type TwoPlyBaselineFile = Readonly<{
  manifest: TwoPlyBaselineManifest;
  cases: readonly TwoPlyBaselineCase[];
}>;

export type TwoPlyBaselineTask = Readonly<{
  startIndex: number;
  count: number;
  seed: number;
}>;

const summarize = (
  index: number,
  evaluation: SelfDrawTwoPlyCandidateEvaluation,
): TwoPlyBaselineCase => ({
  index,
  hand: [],
  melds: [],
  visibleDiscards: [],
  wallCount: BENCHMARK_PROGRESS.wallCount,
  unseenPoolSize: BENCHMARK_PROGRESS.unseenPoolSize,
  candidates: evaluation.candidates.map((candidate) => ({
    discard: candidate.discard,
    kind: candidate.kind,
    onePlyScore: roundBaselineNumber(candidate.onePlyScore)!,
    twoPlyValue: roundBaselineNumber(candidate.twoPlyValue)!,
    continuationProbability: roundBaselineNumber(candidate.probe.continuationProbability)!,
    winProbability: roundBaselineNumber(candidate.probe.winProbability)!,
    outcomeCount: candidate.probe.outcomes.length,
  })),
  bestKind: evaluation.bestKind,
  bestValue: roundBaselineNumber(evaluation.bestValue),
});

export const runTwoPlyBaselineTask = (task: TwoPlyBaselineTask): TwoPlyBaselineCase[] =>
  benchmarkInputs(task.count, task.seed).map((input, offset) => {
    const evaluation = evaluateSelfDrawTwoPlyCandidates(
      input,
      [],
      DEFAULT_JUNK_WEIGHTS,
      BENCHMARK_PROGRESS,
      Number.POSITIVE_INFINITY,
    );
    return {
      ...summarize(task.startIndex + offset, evaluation),
      hand: [...input.hand],
      melds: [...input.melds],
    };
  });

type WorkerMessage =
  { type: "result"; cases: TwoPlyBaselineCase[] } | { type: "error"; message: string };

const runWorkerTask = (workerUrl: URL, task: TwoPlyBaselineTask): Promise<TwoPlyBaselineCase[]> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);
    worker.once("message", (message: WorkerMessage) => {
      void worker.terminate();
      if (message.type === "error") reject(new Error(message.message));
      else resolve(message.cases);
    });
    worker.once("error", (error) => {
      void worker.terminate();
      reject(error);
    });
    worker.postMessage(task);
  });

export const generateTwoPlyBaseline = async (
  count: number,
  workerCount = DEFAULT_BASELINE_WORKERS,
  seed = TWO_PLY_BASELINE_SEED,
  gitRevision = "unknown",
): Promise<TwoPlyBaselineFile> => {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("count must be positive");
  if (!Number.isSafeInteger(workerCount) || workerCount <= 0)
    throw new Error("workerCount must be positive");
  if (!Number.isSafeInteger(seed)) throw new Error("seed must be a safe integer");
  const actualWorkers = Math.min(workerCount, count);
  const chunkSize = Math.ceil(count / actualWorkers);
  const workerUrl = new URL("./two-ply-baseline-worker.ts", import.meta.url);
  const tasks = Array.from({ length: actualWorkers }, (_, index) => {
    const startIndex = index * chunkSize;
    return {
      startIndex,
      count: Math.min(chunkSize, count - startIndex),
      seed: seed + startIndex,
    } satisfies TwoPlyBaselineTask;
  });
  const chunks = await Promise.all(tasks.map((task) => runWorkerTask(workerUrl, task)));
  const cases = chunks.flat().sort((left, right) => left.index - right.index);
  return {
    manifest: {
      format: "new-mj.junk-two-ply-baseline-manifest",
      version: TWO_PLY_BASELINE_VERSION,
      generatedAt: new Date().toISOString(),
      gitRevision,
      seed,
      count,
      workers: actualWorkers,
      numericPrecision: TWO_PLY_BASELINE_NUMERIC_PRECISION,
      progress: BENCHMARK_PROGRESS,
      weights: DEFAULT_JUNK_WEIGHTS,
    },
    cases,
  };
};
