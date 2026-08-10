import { describe, expect, it } from "vitest";
import { executeCalibrationTasks, executeCalibrationTasksInWorkers } from "./executor.ts";

describe("calibration executor", () => {
  const tasks = [
    { taskId: "task-a", input: 1 },
    { taskId: "task-b", input: 2 },
    { taskId: "task-c", input: 3 },
  ] as const;
  const runTask = async (input: number): Promise<number> => input * 10;

  it("keeps task order in sequential mode", async () => {
    await expect(executeCalibrationTasks(tasks, runTask)).resolves.toEqual([
      { taskId: "task-a", result: 10 },
      { taskId: "task-b", result: 20 },
      { taskId: "task-c", result: 30 },
    ]);
  });

  it("keeps the same result order with bounded concurrency", async () => {
    await expect(executeCalibrationTasks(tasks, runTask, { concurrency: 2 })).resolves.toEqual(
      await executeCalibrationTasks(tasks, runTask, { concurrency: 1 }),
    );
  });

  it("rejects invalid concurrency", async () => {
    await expect(executeCalibrationTasks(tasks, runTask, { concurrency: 0 })).rejects.toThrow(
      "INVALID_EXECUTOR_CONCURRENCY",
    );
  });

  it("matches sequential results in worker_threads mode", async () => {
    const sequential = await executeCalibrationTasks(tasks, runTask);
    const workers = await executeCalibrationTasksInWorkers(tasks, {
      workerCount: 2,
      workerUrl: new URL("./worker.ts", import.meta.url),
      moduleUrl: new URL("./executor-worker-test-target.ts", import.meta.url),
      exportName: "multiplyTask",
    });
    expect(workers).toEqual(sequential);
  });
});
