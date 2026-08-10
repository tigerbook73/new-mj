import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tileIdOf, type JunkAction, type JunkPlayerView } from "@new-mj/core";
import { afterEach, describe, expect, it } from "vitest";
import { chooseJunkAction, DEFAULT_JUNK_WEIGHTS, scoreHandShapeAfterDiscard } from "./strategy.ts";
import { loadPolicy, loadWeightsFile } from "./policy-loader.ts";

const currentStrategyPath = fileURLToPath(new URL("./strategy.ts", import.meta.url));

const view: JunkPlayerView = {
  seat: 0,
  hand: [0, 1, 2].map((copy) => tileIdOf("1m", copy)).concat([tileIdOf("2m", 0)]),
  wallCount: 50,
  currentSeat: 0,
  dealer: 0,
  phase: "playing",
  seats: [0, 1, 2, 3].map(() => ({ handCount: 4, melds: [], discards: [], justDrawn: false })),
};
const legalActions: JunkAction[] = [
  { type: "discard", tile: view.hand[0]! },
  { type: "discard", tile: view.hand[3]! },
];

const scratchFiles: string[] = [];
afterEach(() => {
  for (const dir of scratchFiles.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("loadPolicy", () => {
  it("defaults to this package's current strategy.ts", async () => {
    const { policy, modulePath } = await loadPolicy({}, "default");
    expect(modulePath).toBe(currentStrategyPath);
    expect(policy(view, legalActions)).toEqual(
      chooseJunkAction(view, legalActions, {}, DEFAULT_JUNK_WEIGHTS),
    );
  });

  it("accepts an explicit modulePath pointing at the same file", async () => {
    const { policy } = await loadPolicy({ modulePath: currentStrategyPath }, "explicit");
    const { policy: defaultPolicy } = await loadPolicy({}, "default");
    expect(policy(view, legalActions)).toEqual(defaultPolicy(view, legalActions));
  });

  it("overrides weights from weightsPath", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "policy-loader-test-"));
    scratchFiles.push(dir);
    const weightsPath = path.join(dir, "weights.json");
    const customWeights = { ...DEFAULT_JUNK_WEIGHTS, safetyBonus: 999 };
    writeFileSync(weightsPath, JSON.stringify(customWeights));
    const loadedWeights = loadWeightsFile(weightsPath, Object.keys(DEFAULT_JUNK_WEIGHTS));
    const discard = view.hand[0]!;
    const visibleDiscards = [discard];
    const defaultScore = scoreHandShapeAfterDiscard(
      { hand: view.hand, melds: [] },
      discard,
      visibleDiscards,
    );
    const customScore = scoreHandShapeAfterDiscard(
      { hand: view.hand, melds: [] },
      discard,
      visibleDiscards,
      loadedWeights,
    );
    expect(customScore - defaultScore).toBeCloseTo(999 - DEFAULT_JUNK_WEIGHTS.safetyBonus, 6);

    const { policy: customPolicy } = await loadPolicy({ weightsPath }, "custom");
    expect(legalActions).toContainEqual(customPolicy(view, legalActions));
  });

  it("loads a historical version with the pre-probability weight shape", async () => {
    const { policy, label, modulePath } = await loadPolicy({ ref: "6f2a7d8^" }, "historical");
    expect(label).toBe("historical");
    expect(modulePath).not.toBe(currentStrategyPath);
    expect(modulePath.includes(".compare-scratch")).toBe(true);
    scratchFiles.push(path.dirname(modulePath));
    const historicalModule = (await import(pathToFileURL(modulePath).href)) as {
      DEFAULT_JUNK_WEIGHTS: Record<string, number>;
    };
    expect(historicalModule.DEFAULT_JUNK_WEIGHTS).toHaveProperty("improvementWeight");
    expect(historicalModule.DEFAULT_JUNK_WEIGHTS).not.toHaveProperty("tenpaiProbabilityWeight");
    expect(policy(view, legalActions)).toBeDefined();
  }, 20_000);

  it("rejects passing both ref and modulePath", async () => {
    await expect(
      loadPolicy({ ref: "HEAD", modulePath: currentStrategyPath }, "bad"),
    ).rejects.toThrow("POLICY_SOURCE_AMBIGUOUS");
  });
});

describe("loadWeightsFile", () => {
  it("rejects a file whose keys don't match the expected set", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "policy-loader-test-"));
    scratchFiles.push(dir);
    const weightsPath = path.join(dir, "bad.json");
    writeFileSync(weightsPath, JSON.stringify({ onlyOneKey: 1 }));
    expect(() => loadWeightsFile(weightsPath, Object.keys(DEFAULT_JUNK_WEIGHTS))).toThrow(
      "INVALID_WEIGHTS_FILE",
    );
  });
});
