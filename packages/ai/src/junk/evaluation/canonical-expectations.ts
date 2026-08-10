import { STANDARD_TILE_SET, type TileKind } from "@new-mj/core";
import expectationData from "./fixtures/canonical-structural-expectations.json" with { type: "json" };
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  JUNK_CALIBRATION_MANIFEST,
} from "./canonical-fixtures.ts";

type ExpectedStructuralMetrics = Readonly<{
  standardShanten: number;
  improvingKindCount: number;
  liveImprovingTileCount: number;
}>;

export type CanonicalStructuralExpectation = Readonly<{
  id: string;
  scenarioId: string;
  relation: "lower-shanten-vs-wider-ukeire" | "same-shanten-strictly-wider-ukeire";
  leftDiscard: TileKind;
  rightDiscard: TileKind;
  leftMetrics: ExpectedStructuralMetrics;
  rightMetrics: ExpectedStructuralMetrics;
  rationale: string;
}>;

type CanonicalStructuralExpectationData = Readonly<{
  schemaVersion: 1;
  expectations: readonly CanonicalStructuralExpectation[];
}>;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(`INVALID_CANONICAL_EXPECTATION: ${message}`);
};

const loadCanonicalStructuralExpectations = (
  data: CanonicalStructuralExpectationData,
): readonly CanonicalStructuralExpectation[] => {
  assert(data.schemaVersion === 1, "schemaVersion must be 1");
  assert(Array.isArray(data.expectations), "expectations must be an array");
  const ids = new Set<string>();
  for (const expectation of data.expectations) {
    assert(typeof expectation.id === "string" && expectation.id.length > 0, "id is required");
    assert(!ids.has(expectation.id), `duplicate id ${expectation.id}`);
    ids.add(expectation.id);
    assert(
      typeof expectation.rationale === "string" && expectation.rationale.length > 0,
      `${expectation.id} rationale is required`,
    );
    assert(
      expectation.relation === "lower-shanten-vs-wider-ukeire" ||
        expectation.relation === "same-shanten-strictly-wider-ukeire",
      `${expectation.id} relation is invalid`,
    );
    for (const [side, metrics] of [
      ["left", expectation.leftMetrics],
      ["right", expectation.rightMetrics],
    ] as const) {
      assert(metrics && typeof metrics === "object", `${expectation.id} ${side} metrics`);
      assert(Number.isInteger(metrics.standardShanten), `${expectation.id} ${side} shanten`);
      assert(
        Number.isSafeInteger(metrics.improvingKindCount) && metrics.improvingKindCount >= 0,
        `${expectation.id} ${side} improving kind count`,
      );
      assert(
        Number.isSafeInteger(metrics.liveImprovingTileCount) && metrics.liveImprovingTileCount >= 0,
        `${expectation.id} ${side} live improving tile count`,
      );
    }
    assert(
      expectation.leftDiscard !== expectation.rightDiscard,
      `${expectation.id} must compare distinct discards`,
    );
    const scenario = JUNK_CALIBRATION_MANIFEST.scenarios.find(
      ({ id }) => id === expectation.scenarioId,
    );
    assert(scenario, `${expectation.id} references unknown scenario ${expectation.scenarioId}`);
    const input = CANONICAL_JUNK_SCENARIO_PROVIDER.resolve(scenario).input;
    const discardKinds = new Set(
      input.legalActions
        .filter((action) => action.type === "discard")
        .map(({ tile }) => STANDARD_TILE_SET.kindOf(tile)),
    );
    assert(discardKinds.has(expectation.leftDiscard), `${expectation.id} left discard is absent`);
    assert(discardKinds.has(expectation.rightDiscard), `${expectation.id} right discard is absent`);
  }
  return Object.freeze([...data.expectations]);
};

export const CANONICAL_STRUCTURAL_EXPECTATIONS = loadCanonicalStructuralExpectations(
  expectationData as CanonicalStructuralExpectationData,
);
