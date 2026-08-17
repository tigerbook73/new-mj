import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCTION_SELECTION } from "./canonical-fixtures.ts";
import { createJunkFixtureProvider, type JunkProductionFixture } from "./fixture-provider.ts";

const fixture: JunkProductionFixture = CANONICAL_PRODUCTION_SELECTION;

describe("Junk fixture provider", () => {
  it("resolves a real canonical fixture into a legal hash-stable input", () => {
    const provider = createJunkFixtureProvider([fixture]);
    const normalized = provider.resolve(fixture.scenario);
    expect(normalized.scenario.id).toBe(fixture.scenario.id);
    expect(normalized.input.legalActions).toHaveLength(14);
    expect(normalized.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
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
