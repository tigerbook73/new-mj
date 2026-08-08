import { describe, expect, it } from "vitest";
import { benchmarkSelfDrawTwoPly } from "./two-ply-benchmark.ts";

describe("benchmarkSelfDrawTwoPly", () => {
  it("runs the fixed probe and rejects invalid iteration counts", { tags: ["slow"] }, () => {
    const result = benchmarkSelfDrawTwoPly(1);
    expect(result.iterations).toBe(1);
    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(result.msPerProbe).toBe(result.elapsedMs);
    expect(Number.isFinite(result.checksum)).toBe(true);
    expect(() => benchmarkSelfDrawTwoPly(0)).toThrow("positive safe integer");
  });
});
