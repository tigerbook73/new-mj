import { parentPort } from "node:worker_threads";
import { runMatchTask } from "./tune.ts";
import type { MatchTask } from "./tune-pool.ts";

if (!parentPort) throw new Error("tune-worker.ts must run inside a worker_threads Worker");

parentPort.on("message", (task: MatchTask) => {
  parentPort!.postMessage(runMatchTask(task));
});
