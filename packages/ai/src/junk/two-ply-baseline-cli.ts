import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateTwoPlyBaseline } from "./two-ply-baseline.ts";

const [countArgument, outputArgument, workerArgument] = process.argv.slice(2);
const count = countArgument === undefined ? 10_000 : Number(countArgument);
const workerCount = workerArgument === undefined ? undefined : Number(workerArgument);
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const outputPath = path.resolve(
  outputArgument ?? path.join(packageRoot, "benchmark-data", "junk-two-ply-baseline.json"),
);
const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const baseline = await generateTwoPlyBaseline(count, workerCount, undefined, gitRevision);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(baseline)}\n`);
process.stdout.write(
  `${JSON.stringify({ outputPath, count: baseline.count, workers: baseline.workers })}\n`,
);
