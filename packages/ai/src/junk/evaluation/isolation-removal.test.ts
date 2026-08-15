import { STANDARD_TILE_SET } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { chooseJunkAction, DEFAULT_JUNK_WEIGHTS } from "../strategy.ts";
import { CANONICAL_PRODUCTION_SELECTION } from "./canonical-fixtures.ts";
import { evaluateStructuralMetrics } from "./structural-metrics.ts";

describe("isolationPotential removal candidate", () => {
  it("rejects direct removal because it makes discard-001 choose a strictly dominated shape", () => {
    const { scenario, input } = CANONICAL_PRODUCTION_SELECTION;
    const baseline = chooseJunkAction(input.view, input.legalActions);
    const withoutIsolation = chooseJunkAction(
      input.view,
      input.legalActions,
      {},
      {
        ...DEFAULT_JUNK_WEIGHTS,
        isolationPotential: 0,
      },
    );
    const structural = evaluateStructuralMetrics(scenario.id, input);
    const byId = new Map(
      structural.candidates.map((candidate) => [candidate.candidateId, candidate]),
    );
    const baselineMetrics = byId.get(JSON.stringify(baseline))!.metrics;
    const candidateMetrics = byId.get(JSON.stringify(withoutIsolation))!.metrics;

    expect(baseline.type).toBe("discard");
    expect(withoutIsolation.type).toBe("discard");
    if (baseline.type !== "discard" || withoutIsolation.type !== "discard") return;
    expect(STANDARD_TILE_SET.kindOf(baseline.tile)).toBe("5p");
    expect(STANDARD_TILE_SET.kindOf(withoutIsolation.tile)).toBe("1m");
    expect(baselineMetrics).toMatchObject({
      standardShanten: 2,
      liveImprovingKindCount: 15,
      liveImprovingTileCount: 50,
    });
    expect(candidateMetrics).toMatchObject({
      standardShanten: 2,
      liveImprovingKindCount: 9,
      liveImprovingTileCount: 31,
    });
    expect(candidateMetrics.dominatedByCandidateIds).toContain(JSON.stringify(baseline));
  });
});
