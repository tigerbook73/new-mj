import { describe, expect, it } from "vitest";
import { runEvaluationCli } from "./evaluation-cli.ts";

describe("Junk evaluation command suite", () => {
  it("discovers scenario commands from the root help", async () => {
    const result = await runEvaluationCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("scenario list");
    expect(result.output).toContain("scenario run");
    expect(result.output).toContain("scenario batch");
    expect(result.output).toContain("policy diff");
    expect(result.output).toContain("weights compare");
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

  it("keeps the old scenario command as a temporary compatibility alias", async () => {
    const result = await runEvaluationCli(["list"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("discard-snapshot-001");
  });
});
