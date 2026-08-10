import { runCalibrationCli } from "./cli.ts";

const result = runCalibrationCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
