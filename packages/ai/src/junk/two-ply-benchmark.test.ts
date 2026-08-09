import { describe, expect, it } from "vitest";
import {
  BENCHMARK_INPUT,
  BENCHMARK_PROGRESS,
  benchmarkSelfDrawTwoPly,
  evaluateSelfDrawTwoPlyCandidates,
  evaluateStructuralTwoPlyCandidates,
} from "./two-ply-benchmark.ts";

describe("benchmarkSelfDrawTwoPly", () => {
  it("runs the fixed probe and rejects invalid iteration counts", { tags: ["slow"] }, () => {
    const result = benchmarkSelfDrawTwoPly(1);
    expect(result.iterations).toBe(1);
    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(result.msPerProbe).toBe(result.elapsedMs);
    expect(Number.isFinite(result.checksum)).toBe(true);
    expect(() => benchmarkSelfDrawTwoPly(0)).toThrow("positive safe integer");
  });

  it("bounds candidate evaluation without changing the full-fixture winner", () => {
    const topOne = evaluateSelfDrawTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
      1,
    );
    const full = evaluateSelfDrawTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
    );
    expect(topOne.candidates).toHaveLength(1);
    expect(full.candidates.length).toBeGreaterThan(topOne.candidates.length);
    expect(topOne.bestKind).toBe(full.bestKind);
  });

  it("removes the candidate discard from the next-draw probability pool", () => {
    const result = evaluateSelfDrawTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
      Number.POSITIVE_INFINITY,
    );
    const threeMeters = result.candidates.find((candidate) => candidate.kind === "3m");
    expect(threeMeters?.probe.outcomes.find(({ kind }) => kind === "3m")?.probability).toBe(
      3 / BENCHMARK_PROGRESS.unseenPoolSize,
    );
  });

  it("ranks structural candidates from core shanten and live ukeire", () => {
    const result = evaluateStructuralTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
      2,
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every(({ onePlyScore }) => Number.isFinite(onePlyScore))).toBe(true);
  });
});
