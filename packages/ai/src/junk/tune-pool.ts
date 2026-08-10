import { Worker } from "node:worker_threads";
import type { SeatId } from "@new-mj/core";
import type { JunkWeights } from "./strategy.ts";

/** Weight-based match task (weights tune / compare-weights-cli.ts's same-code
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
  candidateModulePath: string;
  candidateWeightsPath?: string;
};

type PendingResolve = (result: MatchTaskResult) => void;

/**
 * Fixed-size worker_threads pool dedicated to running one task per message.
 * Generic over the task shape (`TTask`) so multiple task kinds that all reduce
 * to the same MatchTaskResult can share this implementation instead of each
 * hand-rolling their own pool. Matches are pure, independent, and CPU-bound
 * (the real cost is shanten computation inside strategy.ts, not I/O), which
 * makes them embarrassingly parallel across cores. The pool is meant to be
 * created once and reused for an entire run — not spawned per generation/task
 * — so thread-startup cost is amortized across many matches instead of paid
 * repeatedly.
 *
 * No external worker-pool library: same "hand-write it" call as tune.ts's
 * optimizer itself (see AGENTS.md) — this pool only ever does "post a plain
 * object, get a plain object back", none of the task priority/cancellation/
 * backpressure needs that would make a dependency pay for itself.
 */
export class MatchWorkerPool<TTask> {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly pending = new Map<Worker, PendingResolve>();
  private readonly queue: Array<{ task: TTask; resolve: PendingResolve }> = [];

  constructor(size: number, workerUrl: URL) {
    for (let index = 0; index < Math.max(1, size); index += 1) {
      const worker = new Worker(workerUrl);
      worker.on("message", (result: MatchTaskResult) => this.onSettled(worker, result));
      worker.on("error", (error) => {
        process.stderr.write(`[tune-pool] worker error: ${String(error)}\n`);
        this.onSettled(worker, { ok: false, candidateTotal: 0, baselineTotal: 0 });
      });
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  private onSettled(worker: Worker, result: MatchTaskResult): void {
    const resolve = this.pending.get(worker);
    this.pending.delete(worker);
    this.idle.push(worker);
    resolve?.(result);
    this.dispatchNext();
  }

  private dispatchNext(): void {
    if (this.queue.length === 0 || this.idle.length === 0) return;
    const worker = this.idle.pop();
    const next = this.queue.shift();
    if (!worker || !next) return;
    this.pending.set(worker, next.resolve);
    worker.postMessage(next.task);
  }

  run(task: TTask): Promise<MatchTaskResult> {
    return new Promise((resolve) => {
      this.queue.push({ task, resolve });
      this.dispatchNext();
    });
  }

  runAll(tasks: readonly TTask[]): Promise<MatchTaskResult[]> {
    return Promise.all(tasks.map((task) => this.run(task)));
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}
