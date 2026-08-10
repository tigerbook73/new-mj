import { tileIdOf, type JunkAction, type JunkPlayerView, type TileKind } from "@new-mj/core";
import { CALIBRATION_SCHEMA_VERSION, type CalibrationManifest } from "./types.ts";
import type { JunkProductionFixture } from "./fixture-provider.ts";

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

export const CANONICAL_PRODUCTION_SELECTION: JunkProductionFixture = {
  scenario: {
    id: "canonical-production-selection-001",
    version: 1,
    source: { kind: "fixture", fixtureId: "canonical-production-selection-001" },
    seed: 1,
  },
  input: {
    view,
    legalActions: hand.map((tile): JunkAction => ({ type: "discard", tile })),
  },
};

export const CANONICAL_JUNK_FIXTURES: readonly JunkProductionFixture[] = [
  CANONICAL_PRODUCTION_SELECTION,
];

export const JUNK_CALIBRATION_MANIFEST: CalibrationManifest = {
  schemaVersion: CALIBRATION_SCHEMA_VERSION,
  id: "junk-structural-calibration-canonical",
  version: 1,
  scenarios: CANONICAL_JUNK_FIXTURES.map(({ scenario }) => scenario),
};
