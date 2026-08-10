import manifestData from "./fixtures/canonical-baseline.json" with { type: "json" };
import fixtureData from "./fixtures/hand-shape-001.json" with { type: "json" };
import snapshotData from "./fixtures/midgame-shape-001.snapshot.json" with { type: "json" };
import {
  createJunkFixtureProviderFromRegistry,
  type JunkProductionFixture,
} from "./fixture-provider.ts";
import type { JunkProductionFixtureData } from "./fixture-data.ts";
import type { CalibrationManifest } from "../../evaluation/types.ts";
import {
  createJunkSnapshotProvider,
  type JunkProductionSnapshotData,
} from "./snapshot-provider.ts";

export const JUNK_CALIBRATION_MANIFEST = manifestData as CalibrationManifest;

export const CANONICAL_JUNK_FIXTURE_PROVIDER = createJunkFixtureProviderFromRegistry(
  {
    ...JUNK_CALIBRATION_MANIFEST,
    scenarios: JUNK_CALIBRATION_MANIFEST.scenarios.filter(
      ({ source }) => source.kind === "fixture",
    ),
  },
  { "hand-shape-001": fixtureData as unknown as JunkProductionFixtureData },
);

export const CANONICAL_JUNK_SNAPSHOT_PROVIDER = createJunkSnapshotProvider(
  JUNK_CALIBRATION_MANIFEST,
  { "midgame-shape-001": snapshotData as unknown as JunkProductionSnapshotData },
);

export const CANONICAL_JUNK_SCENARIO_PROVIDER = {
  resolve: (scenario: CalibrationManifest["scenarios"][number]) =>
    scenario.source.kind === "snapshot"
      ? CANONICAL_JUNK_SNAPSHOT_PROVIDER.resolve(scenario)
      : CANONICAL_JUNK_FIXTURE_PROVIDER.resolve(scenario),
};

export const CANONICAL_JUNK_FIXTURES: readonly JunkProductionFixture[] =
  JUNK_CALIBRATION_MANIFEST.scenarios
    .filter(({ source }) => source.kind === "fixture")
    .map((scenario) => CANONICAL_JUNK_FIXTURE_PROVIDER.resolve(scenario))
    .map(({ scenario, input, contentHash }) => ({ scenario, input, contentHash }));

export const CANONICAL_PRODUCTION_SELECTION = CANONICAL_JUNK_FIXTURES[0]!;

export const CANONICAL_JUNK_SNAPSHOT = CANONICAL_JUNK_SNAPSHOT_PROVIDER.resolve(
  JUNK_CALIBRATION_MANIFEST.scenarios.find(({ id }) => id === "discard-snapshot-001")!,
);
