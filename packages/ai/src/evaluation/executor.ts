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
