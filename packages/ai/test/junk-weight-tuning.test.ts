import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_JUNK_WEIGHTS, JUNK_FAN_WEIGHTS } from "../src/junk/strategy.ts";
import { MatchWorkerPool } from "../src/junk/tune-pool.ts";
import {
  evaluateCandidate,
  evaluateTunedWeights,
  formatTuneReport,
  tuneJunkWeights,
  type TuneReport,
} from "../src/junk/tune.ts";

// Tiny by design — this is a smoke test of the tuning *pipeline* (does it run
// end-to-end, produce the right shape, stay reproducible), not a real tuning
// session. Real runs use much larger --max-generations/--seeds-per-generation
// via junk/tune-cli.ts and take proportionally longer. minGenerations defaults
// to 20 (> maxGenerations here), so early-stop convergence checks never fire —
// these runs always use exactly maxGenerations generations, which is what makes
// the "toHaveLength" assertion below meaningful rather than a coincidence.
const TINY_OPTIONS = { maxGenerations: 2, seedsPerGeneration: 1 } as const;

const SYNTHETIC_REPORT: TuneReport = {
  seed: 1,
  generations: [],
  baselineWeights: DEFAULT_JUNK_WEIGHTS,
  tunedWeights: DEFAULT_JUNK_WEIGHTS,
  stopReason: "max-generations",
};
const SYNTHETIC_EVAL = { seeds: [1], candidateScore: 1, baselineScore: 0, candidateWins: 1, totalMatches: 1 };

describe("junk weight tuning", () => {
  describe("formatTuneReport write status", () => {
    it("describes an unattempted write as a manual-adoption reminder", () => {
      const text = formatTuneReport(SYNTHETIC_REPORT, SYNTHETIC_EVAL, TINY_OPTIONS);
      expect(text).toContain("does not change any file");
    });

    it("describes a successful write with the file path", () => {
      const text = formatTuneReport(SYNTHETIC_REPORT, SYNTHETIC_EVAL, TINY_OPTIONS, {
        attempted: true,
        written: true,
        path: "/tmp/default-weights.json",
      });
      expect(text).toContain("wrote the tuned weights to /tmp/default-weights.json");
    });

    it("describes a skipped write with the reason", () => {
      const text = formatTuneReport(SYNTHETIC_REPORT, SYNTHETIC_EVAL, TINY_OPTIONS, {
        attempted: true,
        written: false,
        reason: "held-out evaluation did not show an improvement",
      });
      expect(text).toContain("skipped — held-out evaluation did not show an improvement");
    });
  });

  it(
    "runs end-to-end, keeps defaults immutable, and produces a readable report",
    { tags: ["slow"] },
    async () => {
      const beforeDefaults = { ...DEFAULT_JUNK_WEIGHTS };
      const beforeFanWeights = { ...JUNK_FAN_WEIGHTS };

      const report = await tuneJunkWeights(1, TINY_OPTIONS);
      expect(report.generations).toHaveLength(TINY_OPTIONS.maxGenerations);
      expect(report.stopReason).toBe("max-generations");
      expect(Object.keys(report.tunedWeights).sort()).toEqual(
        Object.keys(DEFAULT_JUNK_WEIGHTS).sort(),
      );
      // mutate() must never write through to the shared defaults it started from.
      expect(DEFAULT_JUNK_WEIGHTS).toEqual(beforeDefaults);
      expect(JUNK_FAN_WEIGHTS).toEqual(beforeFanWeights);

      const finalEval = await evaluateTunedWeights(1, 1, report);
      expect(finalEval.totalMatches).toBeGreaterThan(0);
      expect(finalEval.totalMatches).toBeLessThanOrEqual(2); // 1 eval seed x 2 seat splits

      const text = formatTuneReport(report, finalEval, TINY_OPTIONS);
      expect(text).toContain("Junk AI weight tuning report");
      expect(text).toContain("Weight changes");
      expect(text).toContain("qidui:");
    },
  );

  it(
    "stops itself before the max-generations cap once it detects convergence",
    { tags: ["slow"] },
    async () => {
      // Tiny minGenerations/stagnationPatience so one of the two convergence
      // checks fires quickly instead of needing dozens of generations to prove
      // the mechanism works; maxGenerations is a generous cap this should never
      // reach if early stopping is doing its job.
      const report = await tuneJunkWeights(3, {
        maxGenerations: 50,
        minGenerations: 3,
        seedsPerGeneration: 1,
        stagnationPatience: 3,
      });
      expect(report.generations.length).toBeLessThan(50);
      expect(report.stopReason).not.toBe("max-generations");
    },
  );

  it(
    "is reproducible: the same seed produces the same tuned weights",
    { tags: ["slow"] },
    async () => {
      const first = await tuneJunkWeights(7, TINY_OPTIONS);
      const second = await tuneJunkWeights(7, TINY_OPTIONS);
      expect(second.tunedWeights).toEqual(first.tunedWeights);
      expect(second.generations.map((g) => g.accepted)).toEqual(
        first.generations.map((g) => g.accepted),
      );
    },
  );

  describe("worker pool", () => {
    let pool: MatchWorkerPool | undefined;

    afterEach(async () => {
      await pool?.close();
      pool = undefined;
    });

    it(
      "produces the exact same result as the sequential fallback",
      { tags: ["slow"] },
      async () => {
        // Both paths call the identical runMatchTask (see tune.ts) — this test
        // exists to catch a *wiring* mistake (wrong task fields, dropped results,
        // wrong ordering), not to re-verify runMatchTask's own logic twice.
        const seeds = [11, 12, 13];
        const candidate = { ...DEFAULT_JUNK_WEIGHTS, shantenWeight: 120 };

        const sequential = await evaluateCandidate(seeds, DEFAULT_JUNK_WEIGHTS, candidate);

        pool = new MatchWorkerPool(2);
        const parallel = await evaluateCandidate(seeds, DEFAULT_JUNK_WEIGHTS, candidate, pool);

        expect(parallel).toEqual(sequential);
      },
    );
  });
});
