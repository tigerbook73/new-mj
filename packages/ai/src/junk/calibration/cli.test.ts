import { describe, expect, it } from "vitest";
import { runCalibrationCli } from "./cli.ts";

describe("calibration CLI", () => {
  it("prints help successfully", () => {
    const result = runCalibrationCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("--scenario <id>");
    expect(result.output).toContain("--output-dir <dir>");
    expect(result.output).toContain("--run-id <id>");
  });

  it("lists stable canonical scenario IDs", () => {
    const result = runCalibrationCli(["--list"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("canonical-production-selection-001");
  });

  it("writes JSON and Markdown reports without overwriting a run", () => {
    const files = new Map<string, string>();
    const directories: string[] = [];
    const args = [
      "--scenario",
      "canonical-production-selection-001",
      "--output-dir",
      "/tmp/calibration-cli-test",
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
    expect(files.get("/tmp/calibration-cli-test/cli-test-001.json")).toContain(
      '"schemaVersion": 1',
    );
    expect(files.get("/tmp/calibration-cli-test/cli-test-001.md")).toContain(
      "canonical-production-selection-001",
    );
    expect(directories).toEqual(["/tmp/calibration-cli-test"]);

    const second = runCalibrationCli(args, {
      ...runtime,
      write: (filePath: string, content: string) => files.set(filePath, content),
    });
    expect(second.exitCode).toBe(1);
    expect(second.output).toContain("OUTPUT_ALREADY_EXISTS");
  });
});
