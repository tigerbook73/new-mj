import { describe, expect, it, vi } from "vitest";
import { createEvaluationCommandRegistry } from "./commands.ts";

describe("evaluation command registry", () => {
  it("dispatches the longest matching typed command path", async () => {
    const run = vi.fn(() => ({ exitCode: 0, output: "done" }));
    const registry = createEvaluationCommandRegistry([
      { path: ["scenario", "run"], summary: "Run one scenario", run },
      { path: ["scenario", "run", "saved"], summary: "Run a saved scenario", run: vi.fn() },
    ]);

    const result = await registry.dispatch(["scenario", "run", "discard-001"]);

    expect(result).toEqual({ exitCode: 0, output: "done" });
    expect(run).toHaveBeenCalledWith(["discard-001"]);
  });

  it("formats discoverable root and command-group help", async () => {
    const registry = createEvaluationCommandRegistry([
      { path: ["scenario", "list"], summary: "List scenarios", run: vi.fn() },
      { path: ["scenario", "run"], summary: "Run one scenario", run: vi.fn() },
      { path: ["policy", "diff"], summary: "Compare policies", run: vi.fn() },
    ]);

    expect((await registry.dispatch(["--help"])).output).toContain("scenario run");
    const groupHelp = await registry.dispatch(["scenario", "--help"]);
    expect(groupHelp.exitCode).toBe(0);
    expect(groupHelp.output).toContain("evaluate scenario <command>");
    expect(groupHelp.output).toContain("list");
    expect(groupHelp.output).not.toContain("policy diff");
  });

  it("reports unknown commands with the root help", async () => {
    const registry = createEvaluationCommandRegistry([
      { path: ["scenario", "list"], summary: "List scenarios", run: vi.fn() },
    ]);

    const result = await registry.dispatch(["missing"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unknown command: evaluate missing");
    expect(result.output).toContain("scenario list");
  });
});
