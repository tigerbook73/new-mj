import type { SeatId } from "@new-mj/core";
import type { JunkWeights } from "../../strategy.ts";
import { MatchWorkerPool as EvaluationWorkerPool } from "./worker-pool.ts";

/** Weight-based match task (weights tune / weights-compare.ts's same-code
 * path, dispatched to tune-worker.ts). See policy-match-worker.ts's
 * PolicyMatchTask for the cross-version counterpart — both share the same
 * generic MatchWorkerPool<TTask> below; the pool never inspects task
 * contents, it only ships whatever it's given to whichever worker script the
 * caller points it at. */
export type MatchTask = {
  seed: number;
  candidateSeats: readonly SeatId[];
  baselineWeights: JunkWeights;
  candidateWeights: JunkWeights;
};

export type MatchTaskResult = {
  ok: boolean;
  candidateTotal: number;
  baselineTotal: number;
};

/**
 * Cross-version counterpart to MatchTask (grouped here since the pool below is
 * generic over task shape and this is the other task kind that flows through
 * it) — module paths instead of weight objects, since the two sides may be
 * different code/formula versions, not just different weight values on the
 * same code (see policy-loader.ts). `*ModulePath` must already be a real,
 * resolved file path (policy-loader.ts's resolveModulePath) before building
 * this task: workers only ever `import()`, they never run `git show` — doing
 * the ref snapshot once on the main thread avoids every worker redundantly
 * re-snapshotting its own copy.
 */
export type PolicyMatchTask = {
  seed: number;
  candidateSeats: readonly SeatId[];
  baselineModulePath: string;
  baselineWeightsPath?: string;
  baselineExportName?: string;
  candidateModulePath: string;
  candidateWeightsPath?: string;
  candidateExportName?: string;
};

/** @deprecated Import MatchWorkerPool from worker-pool.ts for non-weighted evaluation. */
export class MatchWorkerPool<TTask, TResult = MatchTaskResult> extends EvaluationWorkerPool<
  TTask,
  TResult
> {
  constructor(
    size: number,
    workerUrl: URL,
    workerErrorResult: (error: unknown) => TResult = () =>
      ({ ok: false, candidateTotal: 0, baselineTotal: 0 }) as TResult,
  ) {
    super(size, workerUrl, workerErrorResult);
  }
}
