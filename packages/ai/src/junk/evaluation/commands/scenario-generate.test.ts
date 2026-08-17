import { describe, expect, it } from "vitest";
import { runGenerateSamplesCli } from "./scenario-generate.ts";

describe("scenario generate CLI", () => {
  it("writes a deterministic manifest and requested JSONL shard", () => {
    const files = new Map<string, string>();
    const result = runGenerateSamplesCli(
      [
        "--seed",
        "41",
        "--count",
        "5",
        "--shard-index",
        "1",
        "--shard-count",
        "2",
        "--output-dir",
        "/tmp/generated-test",
      ],
      {
        exists: (filePath) => files.has(filePath),
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("generated: 2/5");
    expect(files.get("/tmp/generated-test/junk-generated-41.v1.part-0001.manifest.json")).toContain(
      '"purpose": "generated-scan"',
    );
    const jsonl = files.get("/tmp/generated-test/junk-generated-41.v1.part-0001.jsonl")!;
    expect(jsonl.match(/"type":"scenario"/g)).toHaveLength(2);
    expect(jsonl).toContain('"shardCount":2');
  });

  it("does not overwrite an existing artifact", () => {
    const result = runGenerateSamplesCli(["--seed", "1", "--count", "1"], {
      exists: () => true,
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("OUTPUT_ALREADY_EXISTS");
  });
});
