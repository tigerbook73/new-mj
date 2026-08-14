import { createEvaluationCommandRegistry } from "../../../evaluation/commands.ts";
import { runArenaCli } from "./arena.ts";
import { runCaptureJunkPolicyCli } from "./policy-capture.ts";
import { runDecisionDiffCli } from "./policy-diff.ts";
import { runBatchCalibrationCli } from "./scenario-batch.ts";
import { runGenerateSamplesCli } from "./scenario-generate.ts";
import { runCalibrationCli } from "./scenario.ts";
import { runCompareWeightsCli } from "./weights-compare.ts";
import { runTuneCli } from "./weights-tune.ts";

const registry = createEvaluationCommandRegistry([
  {
    path: ["scenario", "list"],
    summary: "List canonical Junk scenarios",
    run: (argv) => runCalibrationCli(["list", ...argv]),
  },
  {
    path: ["scenario", "run"],
    summary: "Evaluate one canonical Junk scenario",
    run: (argv) => runCalibrationCli(["run", ...argv]),
  },
  {
    path: ["scenario", "batch"],
    summary: "Evaluate a JSONL scenario batch",
    run: runBatchCalibrationCli,
  },
  {
    path: ["scenario", "generate"],
    summary: "Generate deterministic standard-hand JSONL samples",
    run: runGenerateSamplesCli,
  },
  {
    path: ["policy", "capture"],
    summary: "Capture the current policy into compare scratch",
    run: (argv) => runCaptureJunkPolicyCli(argv),
  },
  {
    path: ["policy", "diff"],
    summary: "Compare policy decisions on paired self-play states",
    run: runDecisionDiffCli,
  },
  {
    path: ["weights", "compare"],
    summary: "Compare two weight or policy configurations",
    run: runCompareWeightsCli,
  },
  {
    path: ["arena", "run"],
    summary: "Run production-policy Junk self-play sessions",
    run: runArenaCli,
  },
  {
    path: ["weights", "tune"],
    summary: "Search and evaluate candidate Junk weights",
    run: runTuneCli,
  },
]);

export const runEvaluationCli = (argv: readonly string[]) => registry.dispatch(argv);
