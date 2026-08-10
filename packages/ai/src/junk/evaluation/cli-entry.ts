import { runEvaluationCli } from "./commands/registry.ts";

const result = await runEvaluationCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
