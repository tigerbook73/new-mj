import { describe, expect, it } from "vitest";
import { runCalibrationCli } from "./cli.ts";

describe("evaluation CLI", () => {
  it("prints help successfully", () => {
    const result = runCalibrationCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("run <scenario-id>");
    expect(result.output).toContain("--output-dir <dir>");
    expect(result.output).toContain("--run-id <id>");
    expect(result.output).toContain("--baseline <file>");
  });

  it("compares a baseline without modifying it and uses exit code 2 for a quality change", () => {
    const files = new Map<string, string>();
    const baseline = {
      schemaVersion: 1,
      baselineId: "changed-baseline",
      scenarioId: "discard-001",
      scenarioContentHash:
        "sha256:fd10b00c285fc0f6521a373c9a967afd1d61eb25e4665ebd65a6b1da3fc3c4d8",
      evaluator: "production-weighted",
      evaluatorVersion: "v1",
      expected: { selectedCandidateId: "different" },
    };
    const result = runCalibrationCli(
      [
        "run",
        "discard-001",
        "--baseline",
        "baseline.json",
        "--output-dir",
        "/tmp/evaluation-cli-baseline",
        "--run-id",
        "compare-001",
      ],
      {
        now: () => new Date("2026-08-10T00:00:00.000Z"),
        gitSha: "abc1234",
        read: () => JSON.stringify(baseline),
        exists: () => false,
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
      },
    );
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("changed-baseline: changed");
    expect(files.get("/tmp/evaluation-cli-baseline/junk-compare-001.json")).toContain(
      '"kind": "selection-changed"',
    );
    expect(files.has("baseline.json")).toBe(false);
  });

  it("accepts help as a subcommand", () => {
    const result = runCalibrationCli(["help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("evaluate scenario list");
  });

  it("lists stable canonical scenario IDs", () => {
    const result = runCalibrationCli(["list"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("discard-001");
    expect(result.output).toContain("discard-snapshot-001");
  });

  it("writes JSON and Markdown reports without overwriting a run", () => {
    const files = new Map<string, string>();
    const directories: string[] = [];
    const args = [
      "run",
      "discard-001",
      "--output-dir",
      "/tmp/evaluation-cli-test",
      "--run-id",
      "cli-test-001",
    ];
    const runtime = {
      now: () => new Date("2026-08-10T00:00:00.000Z"),
      gitSha: "abc1234",
      exists: (filePath: string) => files.has(filePath),
      makeDirectory: (directory: string) => directories.push(directory),
      write: (filePath: string, content: string) => files.set(filePath, content),
    };
    const result = runCalibrationCli(args, runtime);
    expect(result.exitCode).toBe(0);
    expect(files.get("/tmp/evaluation-cli-test/junk-cli-test-001.json")).toContain(
      '"schemaVersion": 1',
    );
    expect(files.get("/tmp/evaluation-cli-test/junk-cli-test-001.json")).toContain(
      '"evaluator": "one-ply-all"',
    );
    expect(files.get("/tmp/evaluation-cli-test/junk-cli-test-001.json")).toContain(
      '"evaluator": "two-ply-all"',
    );
    expect(files.get("/tmp/evaluation-cli-test/junk-cli-test-001.md")).toContain("discard-001");
    expect(directories).toEqual(["/tmp/evaluation-cli-test"]);

    const second = runCalibrationCli(args, {
      ...runtime,
      write: (filePath: string, content: string) => files.set(filePath, content),
    });
    expect(second.exitCode).toBe(1);
    expect(second.output).toContain("OUTPUT_ALREADY_EXISTS");
  });
});
