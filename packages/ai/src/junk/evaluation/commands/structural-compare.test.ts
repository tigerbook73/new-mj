import { describe, expect, it } from "vitest";
import { evaluateStructuralCompare, runStructuralCompareCli } from "./structural-compare.ts";

describe("structural compare", () => {
  it("runs both seat splits and records both policy latencies", { tags: ["slow"] }, () => {
    let clock = 0;
    const result = evaluateStructuralCompare([20260816], 1, () => (clock += 0.25));
    expect(result.matches.map(({ split }) => split)).toEqual(["structural-even", "structural-odd"]);
    expect(result.failures).toBe(0);
    expect(result.structuralScore + result.weightedScore).toBe(0);
    expect(result.structuralLatency.samples).toBeGreaterThan(0);
    expect(result.weightedLatency.samples).toBeGreaterThan(0);
    expect(result.structuralLatency.p95Ms).toBe(0.25);
    expect(
      Object.values(result.routeDecisions).reduce((sum, count) => sum + count, 0),
    ).toBeGreaterThan(0);
  });

  it("writes a reproducible report without changing policy", async () => {
    const files = new Map<string, string>();
    let clock = 0;
    const result = await runStructuralCompareCli(
      [
        "--seed",
        "20260816",
        "--seeds",
        "1",
        "--rounds",
        "1",
        "--output-dir",
        "/tmp/structural-compare",
        "--run-id",
        "compare-001",
      ],
      {
        now: () => new Date("2026-08-16T00:00:00.000Z"),
        monotonicNow: () => (clock += 0.25),
        gitSha: () => "abc123",
        evaluate: (seeds) => ({
          matches: seeds.flatMap((seed) => [
            { seed, split: "structural-even", structuralScore: 1, weightedScore: -1 },
            { seed, split: "structural-odd", structuralScore: -1, weightedScore: 1 },
          ]),
          structuralScore: 0,
          weightedScore: 0,
          structuralWins: 1,
          weightedWins: 1,
          ties: 0,
          failures: 0,
          stepLimitFailures: 0,
          structuralLatency: { samples: 2, p50Ms: 1, p95Ms: 2, maxMs: 2 },
          weightedLatency: { samples: 2, p50Ms: 1, p95Ms: 1, maxMs: 1 },
          routeDecisions: {
            "ordinary-standard": 10,
            "seven-pairs": 2,
            "other-special": 1,
            ambiguous: 3,
          },
        }),
        exists: (filePath) => files.has(filePath),
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("1 seeds x 2 seat splits");
    expect(result.output).toContain("ordinary=10  seven-pairs=2  other-special=1  ambiguous=3");
    const artifact = JSON.parse(
      files.get("/tmp/structural-compare/junk-structural-compare-compare-001.json")!,
    );
    expect(artifact.data.seeds).toHaveLength(1);
    expect(artifact.data.matches).toHaveLength(2);
  });
});
