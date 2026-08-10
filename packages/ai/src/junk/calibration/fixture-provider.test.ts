import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCTION_SELECTION } from "./canonical-fixtures.ts";
import { createJunkFixtureProvider, type JunkProductionFixture } from "./fixture-provider.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";

const fixture: JunkProductionFixture = CANONICAL_PRODUCTION_SELECTION;

describe("Junk fixture provider and production evaluator", () => {
  it("resolves a real canonical fixture and produces a legal deterministic decision", () => {
    const provider = createJunkFixtureProvider([fixture]);
    const normalized = provider.resolve(fixture.scenario);
    const first = evaluateProductionFixture(normalized.scenario.id, normalized.input);
    const second = evaluateProductionFixture(normalized.scenario.id, normalized.input);

    expect(first.status).toBe("ok");
    expect(first.scenarioId).toBe(fixture.scenario.id);
    expect(normalized.input.legalActions).toContainEqual(first.candidates[0]?.action);
    expect(normalized.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
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
