import { createEvaluationCommandRegistry } from "../../evaluation/commands.ts";
import { runDecisionDiffCli } from "../decision-diff-cli.ts";
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
    path: ["policy", "diff"],
    summary: "Compare policy decisions on paired self-play states",
    run: runDecisionDiffCli,
  },
]);

const legacyCommand = (argv: readonly string[]): readonly string[] =>
  ["list", "run", "batch"].includes(argv[0] ?? "") ? ["scenario", ...argv] : argv;

export const runEvaluationCli = (argv: readonly string[]) => registry.dispatch(legacyCommand(argv));
