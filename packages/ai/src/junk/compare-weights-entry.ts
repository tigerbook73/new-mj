import { runCompareWeightsCli } from "./compare-weights-cli.ts";

const result = await runCompareWeightsCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
