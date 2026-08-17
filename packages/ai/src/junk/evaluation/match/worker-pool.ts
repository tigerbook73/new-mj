import { Worker } from "node:worker_threads";

type PendingResolve<TResult> = (result: TResult) => void;

/** Generic fixed-size worker_threads pool for independent evaluation tasks. */
export class MatchWorkerPool<TTask, TResult> {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly pending = new Map<Worker, PendingResolve<TResult>>();
  private readonly queue: Array<{ task: TTask; resolve: PendingResolve<TResult> }> = [];

  constructor(size: number, workerUrl: URL, workerErrorResult: (error: unknown) => TResult) {
    for (let index = 0; index < Math.max(1, size); index += 1) {
      const worker = new Worker(workerUrl);
      worker.on("message", (result: TResult) => this.onSettled(worker, result));
      worker.on("error", (error) => {
        process.stderr.write(`[evaluation-worker-pool] worker error: ${String(error)}\n`);
        this.onSettled(worker, workerErrorResult(error));
      });
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  private onSettled(worker: Worker, result: TResult): void {
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

  run(task: TTask): Promise<TResult> {
    return new Promise((resolve) => {
      this.queue.push({ task, resolve });
      this.dispatchNext();
    });
  }

  runAll(tasks: readonly TTask[]): Promise<TResult[]> {
    return Promise.all(tasks.map((task) => this.run(task)));
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}
