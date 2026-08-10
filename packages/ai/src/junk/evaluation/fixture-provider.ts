import type { JunkAction, JunkPlayerView } from "@new-mj/core";
import type {
  CalibrationScenario,
  NormalizedCalibrationScenario,
} from "../../evaluation/types.ts";
import { contentHashOf } from "./hash.ts";
import { createJunkProductionFixture, type JunkProductionFixtureData } from "./fixture-data.ts";
import type { CalibrationManifest } from "../../evaluation/types.ts";

export type JunkProductionFixtureInput = Readonly<{
  view: JunkPlayerView;
  legalActions: readonly JunkAction[];
}>;

export type JunkProductionFixture = Readonly<{
  scenario: CalibrationScenario;
  input: JunkProductionFixtureInput;
  contentHash?: string;
}>;

export type JunkFixtureProvider = Readonly<{
  resolve: (
    scenario: CalibrationScenario,
  ) => NormalizedCalibrationScenario<JunkProductionFixtureInput>;
}>;

export type JunkProductionFixtureDataRegistry = Readonly<
  Record<string, JunkProductionFixtureData>
>;

export const createJunkFixtureProvider = (
  fixtures: readonly JunkProductionFixture[],
): JunkFixtureProvider => {
  const byId = new Map(fixtures.map((fixture) => [fixture.scenario.source.kind === "fixture"
    ? fixture.scenario.source.fixtureId
    : fixture.scenario.id, fixture]));
  return {
    resolve: (scenario) => {
      if (scenario.source.kind !== "fixture") {
        throw new Error(`UNSUPPORTED_SCENARIO_SOURCE: ${scenario.source.kind}`);
      }
      const fixture = byId.get(scenario.source.fixtureId);
      if (!fixture) throw new Error(`FIXTURE_NOT_FOUND: ${scenario.source.fixtureId}`);
      return {
        scenario,
        input: fixture.input,
        contentHash: fixture.contentHash ?? contentHashOf(fixture.input),
      };
    },
  };
};

/** Builds fixtures by source fixtureId, so multiple scenarios cannot silently reuse one input. */
export const createJunkFixtureProviderFromRegistry = (
  manifest: CalibrationManifest,
  registry: JunkProductionFixtureDataRegistry,
): JunkFixtureProvider =>
  createJunkFixtureProvider(
    manifest.scenarios.map((scenario) => {
      if (scenario.source.kind !== "fixture") {
        throw new Error(`UNSUPPORTED_SCENARIO_SOURCE: ${scenario.source.kind}`);
      }
      const data = registry[scenario.source.fixtureId];
      if (!data) throw new Error(`FIXTURE_DATA_NOT_FOUND: ${scenario.source.fixtureId}`);
      return createJunkProductionFixture(data, scenario);
    }),
  );
