import manifestData from "./fixtures/junk-structural-calibration-canonical.json" with { type: "json" };
import fixtureData from "./fixtures/canonical-production-selection-001.json" with { type: "json" };
import { createJunkFixtureProviderFromData, type JunkProductionFixture } from "./fixture-provider.ts";
import type { JunkProductionFixtureData } from "./fixture-data.ts";
import type { CalibrationManifest } from "./types.ts";

export const JUNK_CALIBRATION_MANIFEST = manifestData as CalibrationManifest;

export const CANONICAL_JUNK_FIXTURE_PROVIDER = createJunkFixtureProviderFromData(
  JUNK_CALIBRATION_MANIFEST,
  fixtureData as unknown as JunkProductionFixtureData,
);

export const CANONICAL_JUNK_FIXTURES: readonly JunkProductionFixture[] =
  JUNK_CALIBRATION_MANIFEST.scenarios.map((scenario) =>
    CANONICAL_JUNK_FIXTURE_PROVIDER.resolve(scenario),
  ).map(({ scenario, input, contentHash }) => ({ scenario, input, contentHash }));

export const CANONICAL_PRODUCTION_SELECTION = CANONICAL_JUNK_FIXTURES[0]!;
