import { runTuneCli } from "./tune-cli.ts";

const result = await runTuneCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
