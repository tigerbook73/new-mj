import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runSnapshotJunkCli } from "./snapshot-junk-cli.ts";

const scratchRoot = fileURLToPath(new URL("../../.compare-scratch", import.meta.url));

afterEach(() => {
  rmSync(scratchRoot, { recursive: true, force: true });
});

describe("runSnapshotJunkCli", () => {
  it("copies every non-test file into .compare-scratch/<label>/junk/", () => {
    const result = runSnapshotJunkCli(["unit-test-label"], () => {});
    expect(result.exitCode).toBe(0);
    const destination = path.join(scratchRoot, "unit-test-label", "junk");
    const copied = readdirSync(destination);
    expect(copied).toContain("strategy.ts");
    expect(copied.some((name) => name.endsWith(".test.ts"))).toBe(false);
  });

  it("rejects a missing or invalid label", () => {
    expect(runSnapshotJunkCli([]).exitCode).toBe(1);
    expect(runSnapshotJunkCli(["../escape"]).exitCode).toBe(1);
    expect(runSnapshotJunkCli(["."]).exitCode).toBe(1);
    expect(runSnapshotJunkCli([".."]).exitCode).toBe(1);
  });

  it("refuses to overwrite an existing destination", () => {
    const destination = path.join(scratchRoot, "dup", "junk");
    mkdirSync(destination, { recursive: true });
    const result = runSnapshotJunkCli(["dup"], () => {});
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("DESTINATION_ALREADY_EXISTS");
  });
});
