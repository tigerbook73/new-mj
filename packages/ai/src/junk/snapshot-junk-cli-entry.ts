import { runSnapshotJunkCli } from "./snapshot-junk-cli.ts";

const result = runSnapshotJunkCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
