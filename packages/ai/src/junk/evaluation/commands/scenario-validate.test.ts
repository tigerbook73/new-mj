import { describe, expect, it } from "vitest";
import { runPairedStructuralValidationCli } from "./scenario-validate.ts";

describe("scenario validate CLI", () => {
  it("writes stable paired validation artifacts without changing weights", () => {
    const files = new Map<string, string>();
    const result = runPairedStructuralValidationCli(
      [
        "--development-seed",
        "101",
        "--held-out-seed",
        "202",
        "--count",
        "1",
        "--run-id",
        "paired-test",
        "--output-dir",
        "/tmp/paired-test",
      ],
      {
        now: () => new Date("2026-08-14T00:00:00.000Z"),
        gitSha: () => "abc1234",
        exists: (filePath) => files.has(filePath),
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("paired-standard-heldout-v1");
    expect(result.output).toContain("not a win-rate or EV claim");
    expect(files.get("/tmp/paired-test/junk-paired-test.json")).toContain('"splitDisjoint": true');
  });

  it("rejects an overlapping split", () => {
    const result = runPairedStructuralValidationCli([
      "--development-seed",
      "101",
      "--held-out-seed",
      "101",
      "--count",
      "1",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("OVERLAPPING_VALIDATION_SEEDS");
  });
});
