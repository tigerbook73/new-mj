import { createEvaluationCommandRegistry } from "../../evaluation/commands.ts";
import { runArenaCli } from "../arena-cli.ts";
import { runCaptureJunkPolicyCli } from "../capture-policy-cli.ts";
import { runDecisionDiffCli } from "../decision-diff-cli.ts";
import { runCompareWeightsCli } from "../compare-weights-cli.ts";
import { runTuneCli } from "../tune-cli.ts";
import { runBatchCalibrationCli } from "./batch-cli.ts";
import { runCalibrationCli } from "./cli.ts";

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
