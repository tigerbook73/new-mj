import { parentPort } from "node:worker_threads";
import { runTwoPlyBaselineTask, type TwoPlyBaselineTask } from "./two-ply-baseline.ts";

if (!parentPort) throw new Error("two-ply-baseline-worker.ts must run in a worker");

parentPort.on("message", (task: TwoPlyBaselineTask) => {
  try {
    parentPort!.postMessage({ type: "result", cases: runTwoPlyBaselineTask(task) });
  } catch (error) {
    parentPort!.postMessage({ type: "error", message: String(error) });
  }
});
