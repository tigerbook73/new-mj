import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateTwoPlyBaseline } from "./two-ply-baseline.ts";

const [countArgument, outputArgument, workerArgument] = process.argv.slice(2);
const count = countArgument === undefined ? 10_000 : Number(countArgument);
const workerCount = workerArgument === undefined ? undefined : Number(workerArgument);
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const outputPath = path.resolve(
  outputArgument ?? path.join(packageRoot, "benchmark-data", "junk-two-ply-baseline.jsonl"),
);
const manifestPath = outputPath.endsWith(".jsonl")
  ? `${outputPath.slice(0, -".jsonl".length)}.manifest.json`
  : `${outputPath}.manifest.json`;
const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const baseline = await generateTwoPlyBaseline(count, workerCount, undefined, gitRevision);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify(baseline.manifest)}\n`);
const output = createWriteStream(outputPath, { encoding: "utf8" });
for (const item of baseline.cases) {
  if (!output.write(`${JSON.stringify(item)}\n`))
    await new Promise<void>((resolve) => output.once("drain", resolve));
}
await new Promise<void>((resolve, reject) => {
  output.once("finish", resolve);
  output.once("error", reject);
  output.end();
});
process.stdout.write(
  `${JSON.stringify({ outputPath, manifestPath, count: baseline.manifest.count, workers: baseline.manifest.workers })}\n`,
);
