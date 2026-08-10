import { parentPort } from "node:worker_threads";

if (!parentPort) throw new Error("evaluation/worker.ts must run inside a worker_threads Worker");

parentPort.on("message", async (message: Readonly<{
  taskId: string;
  input: unknown;
  moduleUrl: string;
  exportName: string;
}>) => {
  try {
    const module = (await import(message.moduleUrl)) as Record<string, unknown>;
    const task = module[message.exportName];
    if (typeof task !== "function") throw new Error(`WORKER_EXPORT_NOT_FOUND: ${message.exportName}`);
    const result = await task(message.input);
    parentPort!.postMessage({ taskId: message.taskId, ok: true, result });
  } catch (error) {
    parentPort!.postMessage({
      taskId: message.taskId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
