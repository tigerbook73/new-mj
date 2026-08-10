import { describe, expect, it } from "vitest";
import { runEvaluationCli } from "./registry.ts";

describe("Junk evaluation command suite", () => {
  it("discovers scenario commands from the root help", async () => {
    const result = await runEvaluationCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("scenario list");
    expect(result.output).toContain("scenario run");
    expect(result.output).toContain("scenario batch");
    expect(result.output).toContain("policy diff");
    expect(result.output).toContain("policy capture");
    expect(result.output).toContain("weights compare");
    expect(result.output).toContain("weights tune");
    expect(result.output).toContain("arena run");
  });

  it("routes policy capture help without writing files", async () => {
    const result = await runEvaluationCli(["policy", "capture", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("evaluate policy capture");
  });

  it("routes arena help without starting workers", async () => {
    const result = await runEvaluationCli(["arena", "run", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("evaluate arena run");
    expect(result.output).toContain("--matches");
  });

  it("routes weights tune help without starting a search", async () => {
    const result = await runEvaluationCli(["weights", "tune", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("evaluate weights tune");
    expect(result.output).toContain("--write");
  });

  it("routes weights compare help without starting workers", async () => {
    const result = await runEvaluationCli(["weights", "compare", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("evaluate weights compare");
    expect(result.output).toContain("--candidate");
  });

  it("routes command-specific help without running self-play", async () => {
    const result = await runEvaluationCli(["policy", "diff", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("evaluate policy diff");
    expect(result.output).toContain("--baseline-ref");
  });

  it("routes the new scenario list command", async () => {
    const result = await runEvaluationCli(["scenario", "list"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("discard-001");
  });

  it("rejects removed short scenario aliases", async () => {
    const result = await runEvaluationCli(["list"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unknown command: evaluate list");
  });
});
