import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateJunkSamples, serializeGeneratedSamples } from "../generated-samples.ts";

export const generateUsage =
  "Usage: pnpm --filter @new-mj/ai evaluate scenario generate --seed <integer> --count <integer> [options]\n\n" +
  "Options:\n" +
  "  --shard-index <n>             Zero-based shard index (default: 0)\n" +
  "  --shard-count <n>             Total shard count (default: 1)\n" +
  "  --output-dir <dir>             Output directory (default: packages/ai/.evaluation-inputs)\n";

type Runtime = Readonly<{
  exists?: (filePath: string) => boolean;
  write?: (filePath: string, content: string) => void;
  makeDirectory?: (directory: string) => void;
}>;

const integer = (value: string | undefined, name: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`INVALID_${name}`);
  return parsed;
};

export const runGenerateSamplesCli = (
  argv: readonly string[],
  runtime: Runtime = {},
): { exitCode: number; output: string } => {
  try {
    if (argv.includes("--help")) throw new Error(generateUsage);
    let seed: number | undefined;
    let count: number | undefined;
    let shardIndex = 0;
    let shardCount = 1;
    let outputDir = "packages/ai/.evaluation-inputs";
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index];
      const value = argv[index + 1];
      if (!value) throw new Error(`MISSING_VALUE: ${flag}`);
      if (flag === "--seed") seed = integer(value, "SEED");
      else if (flag === "--count") count = integer(value, "SAMPLE_COUNT");
      else if (flag === "--shard-index") shardIndex = integer(value, "SHARD_INDEX");
      else if (flag === "--shard-count") shardCount = integer(value, "SHARD_COUNT");
      else if (flag === "--output-dir") outputDir = value;
      else throw new Error(`UNKNOWN_ARGUMENT: ${flag}`);
    }
    if (seed === undefined) throw new Error("MISSING_VALUE: --seed");
    if (count === undefined) throw new Error("MISSING_VALUE: --count");
    const set = generateJunkSamples({ seed, count, shardIndex, shardCount });
    const directory = path.resolve(outputDir);
    const prefix = `${set.manifest.id}.v${set.manifest.version}`;
    const part = `part-${String(shardIndex).padStart(4, "0")}`;
    const manifestPath = path.join(directory, `${prefix}.${part}.manifest.json`);
    const jsonlPath = path.join(directory, `${prefix}.${part}.jsonl`);
    const exists = runtime.exists ?? existsSync;
    if (exists(manifestPath) || exists(jsonlPath)) throw new Error("OUTPUT_ALREADY_EXISTS");
    (runtime.makeDirectory ?? ((value) => mkdirSync(value, { recursive: true })))(directory);
    const write = runtime.write ?? ((filePath, content) => writeFileSync(filePath, content));
    write(manifestPath, `${JSON.stringify(set.manifest, null, 2)}\n`);
    write(jsonlPath, serializeGeneratedSamples(set, shardIndex, shardCount));
    return {
      exitCode: 0,
      output:
        `generated: ${set.samples.length}/${count}\n` +
        `manifest: ${manifestPath}\n` +
        `jsonl: ${jsonlPath}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${generateUsage}`,
    };
  }
};
