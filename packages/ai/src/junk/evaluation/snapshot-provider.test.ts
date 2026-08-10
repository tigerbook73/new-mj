import { describe, expect, it } from "vitest";
import { STANDARD_TILE_SET } from "@new-mj/core";
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  CANONICAL_JUNK_SNAPSHOT,
  JUNK_CALIBRATION_MANIFEST,
} from "./canonical-fixtures.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";
import { runSingleCalibrationScenario } from "../../evaluation/runner.ts";

describe("Junk snapshot provider", () => {
  it("preserves visible midgame context and produces a deterministic legal decision", () => {
    const normalized = CANONICAL_JUNK_SNAPSHOT;
    expect(normalized.scenario.source.kind).toBe("snapshot");
    expect(normalized.input.view.seats.flatMap(({ discards }) => discards)).toHaveLength(7);
    expect(normalized.input.view.seats[2]?.melds[0]?.type).toBe("peng");
    expect(STANDARD_TILE_SET.kindOf(normalized.input.view.justDrawn!)).toBe("1z");
    expect(normalized.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const first = evaluateProductionFixture(normalized.scenario.id, normalized.input);
    const second = evaluateProductionFixture(normalized.scenario.id, normalized.input);
    expect(first.status).toBe("ok");
    expect(normalized.input.legalActions).toContainEqual(first.candidates[0]?.action);
    expect(second.selectedCandidateId).toBe(first.selectedCandidateId);
  });

  it("runs through the shared manifest, runner and report path", () => {
    const report = runSingleCalibrationScenario(
      JUNK_CALIBRATION_MANIFEST,
      "discard-snapshot-001",
      CANONICAL_JUNK_SCENARIO_PROVIDER,
      (normalized) => evaluateProductionFixture(normalized.scenario.id, normalized.input),
      {
        runId: "snapshot-test",
        gitSha: "working-tree",
        command: "evaluate run discard-snapshot-001",
        configHash: "canonical-baseline@1",
        startedAt: "2026-08-10T00:00:00.000Z",
        workerCount: 1,
      },
    );
    expect(report.evaluations[0]?.scenarioId).toBe("discard-snapshot-001");
    expect(report.evaluations[0]?.scenarioContentHash).toBe(CANONICAL_JUNK_SNAPSHOT.contentHash);
  });
});
