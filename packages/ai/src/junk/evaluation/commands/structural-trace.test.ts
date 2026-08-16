import { describe, expect, it } from "vitest";
import { evaluateStructuralTrace, runStructuralTraceCli } from "./structural-trace.ts";

describe("structural trace", () => {
  it("captures same-view policy divergences for both mixed splits", { tags: ["slow"] }, () => {
    const result = evaluateStructuralTrace(2889165442, 1);
    expect(result.matches.map(({ split }) => split)).toEqual(["structural-even", "structural-odd"]);
    expect(result.matches.every((match) => match.error === undefined)).toBe(true);
    expect(result.decisionPoints).toBeGreaterThan(0);
    expect(result.divergences.length).toBeGreaterThan(0);
    for (const divergence of result.divergences) {
      expect(divergence.weightedAction).not.toEqual(divergence.structuralAction);
      expect(divergence.legalActions).toContainEqual(divergence.weightedAction);
      expect(divergence.legalActions).toContainEqual(divergence.structuralAction);
    }
  });

  it("writes complete divergence data through the evaluation artifact contract", async () => {
    const files = new Map<string, string>();
    const result = await runStructuralTraceCli(
      ["--seed", "1", "--output-dir", "/tmp/structural-trace", "--run-id", "trace-001"],
      {
        now: () => new Date("2026-08-16T00:00:00.000Z"),
        gitSha: () => "abc123",
        evaluate: (seed) => ({
          matches: [
            { split: "structural-even", structuralScore: -1, weightedScore: 1 },
            { split: "structural-odd", structuralScore: 0, weightedScore: 0 },
          ],
          decisionPoints: 1,
          divergences: [],
        }),
        exists: (filePath) => files.has(filePath),
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("decision points: 1");
    const artifact = JSON.parse(
      files.get("/tmp/structural-trace/junk-structural-trace-trace-001.json")!,
    );
    expect(artifact.data.seed).toBe(1);
    expect(artifact.data.matches).toHaveLength(2);
  });
});
