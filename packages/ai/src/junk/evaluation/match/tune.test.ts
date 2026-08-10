import { describe, expect, it } from "vitest";
import { DEFAULT_JUNK_WEIGHTS } from "../../strategy.ts";
import { formatTuneReport, type TuneReport } from "./tune.ts";

const OPTIONS = { maxGenerations: 2, seedsPerGeneration: 1 } as const;
const REPORT: TuneReport = {
  seed: 1,
  generations: [],
  baselineWeights: DEFAULT_JUNK_WEIGHTS,
  tunedWeights: DEFAULT_JUNK_WEIGHTS,
  stopReason: "max-generations",
};
const EVALUATION = {
  seeds: [1],
  candidateScore: 1,
  baselineScore: 0,
  candidateWins: 1,
  totalMatches: 1,
};

describe("formatTuneReport write status", () => {
  it("describes an unattempted write as a manual-adoption reminder", () => {
    expect(formatTuneReport(REPORT, EVALUATION, OPTIONS)).toContain("does not change any file");
  });

  it("describes a successful write with the file path", () => {
    expect(
      formatTuneReport(REPORT, EVALUATION, OPTIONS, {
        attempted: true,
        written: true,
        path: "/tmp/default-weights.json",
      }),
    ).toContain("wrote the tuned weights to /tmp/default-weights.json");
  });

  it("describes a skipped write with the reason", () => {
    expect(
      formatTuneReport(REPORT, EVALUATION, OPTIONS, {
        attempted: true,
        written: false,
        reason: "held-out evaluation did not show an improvement",
      }),
    ).toContain("skipped — held-out evaluation did not show an improvement");
  });
});
