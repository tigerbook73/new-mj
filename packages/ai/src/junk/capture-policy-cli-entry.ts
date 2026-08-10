import { runCaptureJunkPolicyCli } from "./capture-policy-cli.ts";

const result = runCaptureJunkPolicyCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
