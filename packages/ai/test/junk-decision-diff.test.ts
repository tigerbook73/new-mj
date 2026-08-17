import { describe, expect, it } from "vitest";
import { productionPolicy, type SeatPolicy } from "../src/junk/evaluation/match/arena.ts";
import { runDecisionDiff } from "../src/junk/evaluation/policy/decision-diff.ts";

// 这是工具级冒烟，不承担多 seed 的统计覆盖；大规模比较通过
// `pnpm --filter @new-mj/ai evaluate policy diff` 手动执行。
const SEEDS = [1];

describe("runDecisionDiff", () => {
  it("finds zero divergences when both sides are the same policy", { tags: ["slow"] }, () => {
    const policy = productionPolicy();
    const report = runDecisionDiff(SEEDS, policy, policy);
    expect(report.decisionPoints).toBeGreaterThan(0);
    expect(report.divergences).toEqual([]);
  });

  it(
    "finds divergences when two policies choose opposite ends of legal actions",
    { tags: ["slow"] },
    () => {
      const baseline: SeatPolicy = (_view, actions) => actions[0]!;
      const candidate: SeatPolicy = (_view, actions) => actions[actions.length - 1]!;
      const report = runDecisionDiff(SEEDS, baseline, candidate);
      expect(report.divergences.length).toBeGreaterThan(0);
      for (const divergence of report.divergences) {
        expect(divergence.driverAction).not.toEqual(divergence.otherAction);
        expect(["baseline", "candidate"]).toContain(divergence.driver);
      }
    },
  );
});
