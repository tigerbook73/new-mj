import { describe, expect, it } from "vitest";
import type { SeatPolicy } from "../match/arena.ts";
import { runDecisionDiffCli } from "./policy-diff.ts";

const policy: SeatPolicy = (_view, legalActions) => legalActions[0]!;

describe("decision diff CLI", () => {
  it("writes stable summary and text artifacts through an injected runtime", async () => {
    const files = new Map<string, string>();
    const result = await runDecisionDiffCli(
      [
        "--seed",
        "1",
        "--seeds",
        "2",
        "--sample-size",
        "0",
        "--output-dir",
        "/tmp/decision-diff-cli",
        "--run-id",
        "diff-001",
      ],
      () => undefined,
      {
        now: () => new Date("2026-08-10T00:00:00.000Z"),
        gitSha: "abc1234",
        load: async (_source, label) => ({ policy, label, modulePath: `${label}.ts` }),
        evaluate: () => ({ decisionPoints: 24, divergences: [] }),
        exists: (filePath) => files.has(filePath),
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("decision points evaluated: 24");
    expect(result.output).toContain("junk-policy-diff-diff-001.json");
    const json = files.get("/tmp/decision-diff-cli/junk-policy-diff-diff-001.json");
    expect(json).toContain('"gitSha": "abc1234"');
    expect(json).toContain('"divergenceCount": 0');
    expect(files.get("/tmp/decision-diff-cli/junk-policy-diff-diff-001.txt")).toContain(
      "Junk AI decision-diff report",
    );
  });

  it("rejects an existing run without loading policies", async () => {
    let loadCount = 0;
    const result = await runDecisionDiffCli(
      ["--run-id", "existing", "--output-dir", "/tmp/decision-diff-cli"],
      () => undefined,
      {
        load: async (_source, label) => {
          loadCount += 1;
          return { policy, label, modulePath: `${label}.ts` };
        },
        evaluate: () => ({ decisionPoints: 0, divergences: [] }),
        exists: () => true,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("OUTPUT_ALREADY_EXISTS");
    expect(loadCount).toBe(0);
  });

  it("passes explicit baseline and candidate exports to the generic loader", async () => {
    const sources: unknown[] = [];
    const result = await runDecisionDiffCli(
      [
        "--baseline-export",
        "recommendStructuralBaselineV3Action",
        "--candidate-export",
        "recommendCandidateAction",
        "--seeds",
        "1",
        "--sample-size",
        "0",
        "--run-id",
        "exports",
      ],
      () => undefined,
      {
        load: async (source, label) => {
          sources.push(source);
          return { policy, label, modulePath: `${label}.ts` };
        },
        evaluate: () => ({ decisionPoints: 0, divergences: [] }),
        exists: () => false,
        makeDirectory: () => undefined,
        write: () => undefined,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(sources).toEqual([
      { exportName: "recommendStructuralBaselineV3Action" },
      { exportName: "recommendCandidateAction" },
    ]);
  });
});
