import { runDecisionDiffCli } from "./decision-diff-cli.ts";

const result = await runDecisionDiffCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
