import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_JUNK_WEIGHTS } from "../src/junk/strategy.ts";
import { evaluateCandidatePolicies } from "../src/junk/evaluation/match/tune.ts";
import { MatchWorkerPool, type PolicyMatchTask } from "../src/junk/evaluation/match/tune-pool.ts";

const currentStrategyPath = fileURLToPath(new URL("../src/junk/strategy.ts", import.meta.url));

// Both paths call the identical runPolicyMatchTask (see tune.ts) — this test
// exists to catch a *wiring* mistake (wrong task fields, dropped results,
// wrong ordering, or the worker resolving a different module than intended),
// not to re-verify runPolicyMatchTask's own logic twice. Mirrors
// junk-weight-tuning.test.ts's equivalent check for the weight-based pool.
describe("policy-based worker pool", () => {
  let pool: MatchWorkerPool<PolicyMatchTask> | undefined;
  let scratchDir: string | undefined;

  afterEach(async () => {
    await pool?.close();
    pool = undefined;
    if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
    scratchDir = undefined;
  });

  it("produces the exact same result as the sequential fallback", { tags: ["slow"] }, async () => {
    scratchDir = mkdtempSync(path.join(os.tmpdir(), "policy-match-pool-test-"));
    const weightsPath = path.join(scratchDir, "candidate-weights.json");
    writeFileSync(weightsPath, JSON.stringify({ ...DEFAULT_JUNK_WEIGHTS, shantenWeight: 120 }));
    const seeds = [11, 12, 13];
    const baseline = { modulePath: currentStrategyPath };
    const candidate = { modulePath: currentStrategyPath, weightsPath };

    const sequential = await evaluateCandidatePolicies(seeds, baseline, candidate);

    pool = new MatchWorkerPool<PolicyMatchTask>(
      2,
      new URL("../src/junk/evaluation/match/policy-match-worker.ts", import.meta.url),
    );
    const parallel = await evaluateCandidatePolicies(seeds, baseline, candidate, pool);

    expect(parallel).toEqual(sequential);
  });
});
