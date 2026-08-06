import { describe, expect, it } from "vitest";
import { DEFAULT_JUNK_WEIGHTS, JUNK_FAN_WEIGHTS } from "../src/junk/strategy.ts";
import { evaluateTunedWeights, formatTuneReport, tuneJunkWeights } from "../src/junk/tune.ts";

// Tiny by design — this is a smoke test of the tuning *pipeline* (does it run
// end-to-end, produce the right shape, stay reproducible), not a real tuning
// session. Real runs use much larger --generations/--seeds-per-generation via
// junk/tune-cli.ts and take proportionally longer.
const TINY_OPTIONS = { generations: 2, seedsPerGeneration: 1 } as const;

describe("junk weight tuning", () => {
  it(
    "runs end-to-end, keeps defaults immutable, and produces a readable report",
    { tags: ["slow"] },
    () => {
      const beforeDefaults = { ...DEFAULT_JUNK_WEIGHTS };
      const beforeFanWeights = { ...JUNK_FAN_WEIGHTS };

      const report = tuneJunkWeights(1, TINY_OPTIONS);
      expect(report.generations).toHaveLength(TINY_OPTIONS.generations);
      expect(Object.keys(report.tunedWeights).sort()).toEqual(
        Object.keys(DEFAULT_JUNK_WEIGHTS).sort(),
      );
      // mutate() must never write through to the shared defaults it started from.
      expect(DEFAULT_JUNK_WEIGHTS).toEqual(beforeDefaults);
      expect(JUNK_FAN_WEIGHTS).toEqual(beforeFanWeights);

      const finalEval = evaluateTunedWeights(1, 1, report);
      expect(finalEval.totalMatches).toBeGreaterThan(0);
      expect(finalEval.totalMatches).toBeLessThanOrEqual(2); // 1 eval seed x 2 seat splits

      const text = formatTuneReport(report, finalEval, TINY_OPTIONS);
      expect(text).toContain("Junk AI weight tuning report");
      expect(text).toContain("Weight changes");
      expect(text).toContain("qidui:");
    },
  );

  it("is reproducible: the same seed produces the same tuned weights", { tags: ["slow"] }, () => {
    const first = tuneJunkWeights(7, TINY_OPTIONS);
    const second = tuneJunkWeights(7, TINY_OPTIONS);
    expect(second.tunedWeights).toEqual(first.tunedWeights);
    expect(second.generations.map((g) => g.accepted)).toEqual(
      first.generations.map((g) => g.accepted),
    );
  });
});
