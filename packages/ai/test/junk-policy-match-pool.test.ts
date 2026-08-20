import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateCandidatePolicies,
  type PolicyMatchTask,
  type PolicyMatchTaskResult,
} from "../src/junk/evaluation/match/policy-match.ts";
import { MatchWorkerPool } from "../src/junk/evaluation/match/worker-pool.ts";

const currentStrategyPath = fileURLToPath(new URL("../src/junk/strategy.ts", import.meta.url));

// Both paths call the identical runPolicyMatchTask — this test
// exists to catch a *wiring* mistake (wrong task fields, dropped results,
// wrong ordering, or the worker resolving a different module than intended),
// not to re-verify runPolicyMatchTask's own logic twice.
describe("policy-based worker pool", () => {
  let pool: MatchWorkerPool<PolicyMatchTask, PolicyMatchTaskResult> | undefined;

  afterEach(async () => {
    await pool?.close();
    pool = undefined;
  });

  it("produces the exact same result as the sequential fallback", { tags: ["slow"] }, async () => {
    // One deterministic task is sufficient to catch worker wiring, ordering,
    // serialization, and module-resolution differences.
    const seeds = [11];
    const baseline = {
      modulePath: currentStrategyPath,
      exportName: "recommendStructuralBaselineV4Action",
    };
    const candidate = { modulePath: currentStrategyPath, exportName: "chooseJunkAction" };

    const sequential = await evaluateCandidatePolicies(seeds, baseline, candidate);

    pool = new MatchWorkerPool<PolicyMatchTask, PolicyMatchTaskResult>(
      2,
      new URL("../src/junk/evaluation/match/policy-match-worker.ts", import.meta.url),
      () => ({ ok: false, candidateTotal: 0, baselineTotal: 0 }),
    );
    const parallel = await evaluateCandidatePolicies(seeds, baseline, candidate, pool);

    expect(parallel).toEqual(sequential);
  });
});
