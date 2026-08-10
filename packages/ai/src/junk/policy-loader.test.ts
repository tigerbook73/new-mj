import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_JUNK_WEIGHTS } from "./strategy.ts";
import { loadWeightsFile, resolveModulePath } from "./policy-loader.ts";

const scratchFiles: string[] = [];
afterEach(() => {
  for (const directory of scratchFiles.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("policy source validation", () => {
  it("rejects passing both ref and modulePath before touching Git", () => {
    expect(() => resolveModulePath({ ref: "HEAD", modulePath: "strategy.ts" })).toThrow(
      "POLICY_SOURCE_AMBIGUOUS",
    );
  });

  it("rejects a weights file whose keys do not match the policy", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "policy-loader-test-"));
    scratchFiles.push(directory);
    const weightsPath = path.join(directory, "bad.json");
    writeFileSync(weightsPath, JSON.stringify({ onlyOneKey: 1 }));
    expect(() => loadWeightsFile(weightsPath, Object.keys(DEFAULT_JUNK_WEIGHTS))).toThrow(
      "INVALID_WEIGHTS_FILE",
    );
  });
});
