import { describe, expect, it } from "vitest";
import { DEFAULT_JUNK_WEIGHTS } from "../../strategy.ts";
import { runTuneCli } from "./weights-tune.ts";
import type { TuneReport } from "../match/tune.ts";

const REPORT: TuneReport = {
  seed: 7,
  generations: [],
  baselineWeights: DEFAULT_JUNK_WEIGHTS,
  tunedWeights: DEFAULT_JUNK_WEIGHTS,
  stopReason: "max-generations",
};

describe("runTuneCli", () => {
  it("writes versioned JSON and text artifacts without changing weights by default", async () => {
    const files = new Map<string, string>();
    const result = await runTuneCli(
      [
        "--seed",
        "7",
        "--max-generations",
        "1",
        "--min-generations",
        "1",
        "--output-dir",
        "/tmp/tune-cli",
        "--run-id",
        "tune-001",
      ],
      () => undefined,
      {
        now: () => new Date("2026-08-10T00:00:00.000Z"),
        gitSha: () => "abc123",
        exists: (filePath) => files.has(filePath),
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
        createPool: () => ({ close: async () => undefined }) as never,
        tune: async () => REPORT,
        evaluate: async () => ({
          seeds: [11],
          candidateScore: 0,
          baselineScore: 0,
          candidateWins: 0,
          totalMatches: 2,
        }),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("junk-weights-tune-tune-001.json");
    const json = files.get("/tmp/tune-cli/junk-weights-tune-tune-001.json");
    expect(json).toBeDefined();
    expect(JSON.parse(json!).run).toMatchObject({ runId: "tune-001", gitSha: "abc123" });
    expect(JSON.parse(json!).data.writeStatus).toEqual({ attempted: false });
    expect(files.get("/tmp/tune-cli/junk-weights-tune-tune-001.txt")).toContain(
      "Junk AI weight tuning report",
    );
  });

  it("rejects an existing artifact before starting the search", async () => {
    let searched = false;
    const result = await runTuneCli(
      ["--output-dir", "/tmp/tune-cli", "--run-id", "existing"],
      () => undefined,
      {
        exists: () => true,
        tune: async () => {
          searched = true;
          return REPORT;
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("OUTPUT_ALREADY_EXISTS");
    expect(searched).toBe(false);
  });
});
