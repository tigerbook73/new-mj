import { parentPort } from "node:worker_threads";
import { runPolicyMatchTask, type PolicyMatchTask } from "./policy-match.ts";

if (!parentPort) throw new Error("policy-match-worker.ts must run inside a worker_threads Worker");
const port = parentPort;

port.on("message", (task: PolicyMatchTask) => {
  runPolicyMatchTask(task)
    .then((result) => port.postMessage(result))
    .catch((error: unknown) => {
      process.stderr.write(`[policy-match-worker] task error: ${String(error)}\n`);
      port.postMessage({ ok: false, candidateTotal: 0, baselineTotal: 0 });
    });
});
