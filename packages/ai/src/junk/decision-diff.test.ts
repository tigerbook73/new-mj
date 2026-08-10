import { describe, expect, it } from "vitest";
import { strengthPolicy } from "./arena.ts";
import { runDecisionDiff } from "./decision-diff.ts";
import { DEFAULT_JUNK_WEIGHTS } from "./strategy.ts";

// 这是工具级冒烟，不承担多 seed 的统计覆盖；大规模比较通过
// `pnpm decision-diff:junk` 手动执行。
const SEEDS = [1];

describe("runDecisionDiff", () => {
  it("finds zero divergences when both sides are the same policy", { tags: ["slow"] }, () => {
    const policy = strengthPolicy({}, DEFAULT_JUNK_WEIGHTS);
    const report = runDecisionDiff(SEEDS, policy, policy);
    expect(report.decisionPoints).toBeGreaterThan(0);
    expect(report.divergences).toEqual([]);
  });

  it(
    "finds divergences when the candidate's weights are drastically different",
    { tags: ["slow"] },
    () => {
      const baseline = strengthPolicy({}, DEFAULT_JUNK_WEIGHTS);
      // An inverted shantenWeight makes the candidate actively prefer *worsening*
      // its own shanten — almost the exact opposite of the baseline's preference
      // whenever there's more than one legal option, unlike a narrow single-fan
      // weight that only matters in specific hand shapes.
      const candidate = strengthPolicy({}, { ...DEFAULT_JUNK_WEIGHTS, shantenWeight: -1000 });
      const report = runDecisionDiff(SEEDS, baseline, candidate);
      expect(report.divergences.length).toBeGreaterThan(0);
      for (const divergence of report.divergences) {
        expect(divergence.driverAction).not.toEqual(divergence.otherAction);
        expect(["baseline", "candidate"]).toContain(divergence.driver);
      }
    },
  );
});
