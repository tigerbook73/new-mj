export type CalibrationTask<TInput> = Readonly<{
  taskId: string;
  input: TInput;
}>;

export type CalibrationTaskRunner<TInput, TResult> = (
  input: TInput,
) => TResult | Promise<TResult>;

export type CalibrationExecutorOptions = Readonly<{
  concurrency?: number;
}>;

/**
 * Executes independent tasks with one shared pure task function. The current
 * implementation is an async bounded executor; a worker_threads adapter can
 * implement the same contract later without changing task or aggregation code.
 */
export const executeCalibrationTasks = async <TInput, TResult>(
  tasks: readonly CalibrationTask<TInput>[],
  runTask: CalibrationTaskRunner<TInput, TResult>,
  options: CalibrationExecutorOptions = {},
): Promise<readonly Readonly<{ taskId: string; result: TResult }>[]> => {
  const concurrency = options.concurrency ?? 1;
  if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new Error("INVALID_EXECUTOR_CONCURRENCY");
  }
  const results: Array<{ taskId: string; result: TResult } | undefined> =
    Array.from({ length: tasks.length });
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      const task = tasks[index]!;
      results[index] = { taskId: task.taskId, result: await runTask(task.input) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results as Array<{ taskId: string; result: TResult }>;
};

type WorkerMessage<TResult> = Readonly<{
  taskId: string;
  ok: boolean;
  result?: TResult;
  error?: string;
}>;

type PendingTask = Readonly<{
  index: number;
  task: CalibrationTask<unknown>;
}>;

/** Runs a JSON-serializable task function in a bounded worker_threads pool. */
export const executeCalibrationTasksInWorkers = async <TInput, TResult>(
  tasks: readonly CalibrationTask<TInput>[],
  options: Readonly<{
    workerCount: number;
    workerUrl: URL;
    moduleUrl: URL;
    exportName: string;
  }>,
): Promise<readonly Readonly<{ taskId: string; result: TResult }>[]> => {
  if (!Number.isSafeInteger(options.workerCount) || options.workerCount <= 0) {
    throw new Error("INVALID_EXECUTOR_WORKER_COUNT");
  }
  if (tasks.length === 0) return [];
  const results: Array<{ taskId: string; result: TResult } | undefined> =
    Array.from({ length: tasks.length });
  const workers = Array.from(
    { length: Math.min(options.workerCount, tasks.length) },
    () => new Worker(options.workerUrl),
  );
  const idle = [...workers];
  const pending = new Map<Worker, PendingTask>();
  const queue = tasks.map((task, index) => ({ index, task }));
  let settled = 0;
  let rejected = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: unknown): void => {
        if (rejected) return;
        rejected = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const dispatch = (): void => {
        while (!rejected && idle.length > 0 && queue.length > 0) {
          const worker = idle.pop()!;
          const pendingTask = queue.shift()!;
          pending.set(worker, pendingTask);
          worker.postMessage({
            taskId: pendingTask.task.taskId,
            input: pendingTask.task.input,
            moduleUrl: options.moduleUrl.href,
            exportName: options.exportName,
          });
        }
      };
      for (const worker of workers) {
        worker.on("message", (message: WorkerMessage<TResult>) => {
          const pendingTask = pending.get(worker);
          if (!pendingTask) return fail("WORKER_TASK_NOT_FOUND");
          pending.delete(worker);
          idle.push(worker);
          if (!message.ok) return fail(message.error ?? "WORKER_TASK_FAILED");
          results[pendingTask.index] = { taskId: message.taskId, result: message.result as TResult };
          settled += 1;
          if (settled === tasks.length) resolve();
          else dispatch();
        });
        worker.on("error", fail);
      }
      dispatch();
    });
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
  return results as Array<{ taskId: string; result: TResult }>;
};
import { Worker } from "node:worker_threads";
