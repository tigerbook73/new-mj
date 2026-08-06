import { Worker } from "node:worker_threads";
import type { SeatId } from "@new-mj/core";
import type { JunkWeights } from "./strategy.ts";

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

type PendingResolve = (result: MatchTaskResult) => void;

/**
 * Fixed-size worker_threads pool dedicated to running one MatchTask per message.
 * Matches are pure, independent, and CPU-bound (the real cost is shanten
 * computation inside strategy.ts, not I/O), which makes them embarrassingly
 * parallel across cores. The pool is meant to be created once and reused for an
 * entire tuning run — not spawned per generation — so thread-startup cost is
 * amortized across many matches instead of paid repeatedly.
 *
 * No external worker-pool library: same "hand-write it" call as tune.ts's
 * optimizer itself (see AGENTS.md) — this pool is small and single-purpose
 * enough that a dependency isn't proportionate to what it buys.
 */
export class MatchWorkerPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly pending = new Map<Worker, PendingResolve>();
  private readonly queue: Array<{ task: MatchTask; resolve: PendingResolve }> = [];

  constructor(size: number) {
    const workerUrl = new URL("./tune-worker.ts", import.meta.url);
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

  run(task: MatchTask): Promise<MatchTaskResult> {
    return new Promise((resolve) => {
      this.queue.push({ task, resolve });
      this.dispatchNext();
    });
  }

  runAll(tasks: readonly MatchTask[]): Promise<MatchTaskResult[]> {
    return Promise.all(tasks.map((task) => this.run(task)));
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}
