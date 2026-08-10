import { runCalibrationCli } from "./cli.ts";
import { runBatchCalibrationCli } from "./batch-cli.ts";

const argv = process.argv.slice(2);
const result = argv[0] === "batch"
  ? await runBatchCalibrationCli(argv.slice(1))
  : runCalibrationCli(argv);
process.stdout.write(result.output);
process.exitCode = result.exitCode;
