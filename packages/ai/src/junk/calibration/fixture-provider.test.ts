import { tileIdOf, type JunkAction, type JunkPlayerView, type TileKind } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { createJunkFixtureProvider, type JunkProductionFixture } from "./fixture-provider.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";

const handKinds: TileKind[] = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "7m",
  "8m",
  "9m",
  "2p",
  "3p",
  "5p",
  "7s",
  "8s",
  "1z",
];

const hand = handKinds.map((kind, index) => {
  const copy = handKinds.slice(0, index).filter((previous) => previous === kind).length;
  return tileIdOf(kind, copy);
});
const view: JunkPlayerView = {
  seat: 0,
  hand,
  wallCount: 50,
  currentSeat: 0,
  dealer: 0,
  phase: "playing",
  seats: [0, 1, 2, 3].map(() => ({ handCount: 13, melds: [], discards: [], justDrawn: false })),
};
const legalActions: JunkAction[] = hand.map((tile) => ({ type: "discard", tile }));

const fixture: JunkProductionFixture = {
  scenario: {
    id: "canonical-production-selection-001",
    version: 1,
    source: { kind: "fixture", fixtureId: "canonical-production-selection-001" },
    seed: 1,
  },
  input: { view, legalActions },
};

describe("Junk fixture provider and production evaluator", () => {
  it("resolves a real canonical fixture and produces a legal deterministic decision", () => {
    const provider = createJunkFixtureProvider([fixture]);
    const normalized = provider.resolve(fixture.scenario);
    const first = evaluateProductionFixture(normalized.scenario.id, normalized.input);
    const second = evaluateProductionFixture(normalized.scenario.id, normalized.input);

    expect(first.status).toBe("ok");
    expect(first.scenarioId).toBe(fixture.scenario.id);
    expect(normalized.input.legalActions).toContainEqual(first.candidates[0]?.action);
    expect(second.selectedCandidateId).toBe(first.selectedCandidateId);
  });

  it("rejects a non-fixture source in the fixture provider", () => {
    const provider = createJunkFixtureProvider([fixture]);
    expect(() =>
      provider.resolve({
        ...fixture.scenario,
        source: { kind: "generated", seed: 1, generatorVersion: "v1" },
      }),
    ).toThrow("UNSUPPORTED_SCENARIO_SOURCE");
  });
});
