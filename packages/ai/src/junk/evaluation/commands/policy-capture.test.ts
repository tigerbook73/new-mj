import { describe, expect, it } from "vitest";
import { runCaptureJunkPolicyCli } from "./policy-capture.ts";

describe("runCaptureJunkPolicyCli", () => {
  it("copies only the policy dependency closure into .compare-scratch/<label>/junk/", () => {
    const directories: string[] = [];
    const copies: Array<{ source: string; destination: string }> = [];
    const result = runCaptureJunkPolicyCli(["unit-test-label"], () => {}, {
      exists: () => false,
      makeDirectory: (directory) => directories.push(directory),
      copy: (source, destination) => copies.push({ source, destination }),
    });
    expect(result.exitCode).toBe(0);
    expect(directories).toHaveLength(1);
    expect(directories[0]).toContain(".compare-scratch/unit-test-label/junk");
    expect(copies.map(({ destination }) => destination.split("/").at(-1)).sort()).toEqual([
      "action-scoring.ts",
      "analysis.ts",
      "default-weights.json",
      "hand-quality.ts",
      "strategy.ts",
      "structural-baseline.ts",
      "structural-claim.ts",
      "structural-discard.ts",
      "structural-routes.ts",
      "structural-turn.ts",
      "tile-probability.ts",
      "two-ply.ts",
      "weights.ts",
    ]);
  });

  it("rejects a missing or invalid label", () => {
    expect(runCaptureJunkPolicyCli([]).exitCode).toBe(1);
    expect(runCaptureJunkPolicyCli(["../escape"]).exitCode).toBe(1);
    expect(runCaptureJunkPolicyCli(["."]).exitCode).toBe(1);
    expect(runCaptureJunkPolicyCli([".."]).exitCode).toBe(1);
    expect(runCaptureJunkPolicyCli(["valid", "extra"]).exitCode).toBe(1);
  });

  it("refuses to overwrite an existing destination", () => {
    let copied = false;
    const result = runCaptureJunkPolicyCli(["dup"], () => {}, {
      exists: () => true,
      copy: () => {
        copied = true;
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("DESTINATION_ALREADY_EXISTS");
    expect(copied).toBe(false);
  });
});
