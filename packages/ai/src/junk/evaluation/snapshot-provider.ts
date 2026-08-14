import {
  tileIdOf,
  type DiscardEntry,
  type JunkAction,
  type JunkPhase,
  type JunkPlayerView,
  type Meld,
  type MeldType,
  type TileKind,
} from "@new-mj/core";
import type {
  CalibrationManifest,
  CalibrationScenario,
  NormalizedCalibrationScenario,
} from "../../evaluation/types.ts";
import { contentHashOf } from "./hash.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";

type TileRef = Readonly<{ kind: TileKind; copy: number }>;
type SnapshotMeld = Readonly<{
  type: MeldType;
  tiles: readonly TileRef[];
  from?: 0 | 1 | 2 | 3;
}>;
type SnapshotDiscard = Readonly<{ tile: TileRef; claimedBy?: 0 | 1 | 2 | 3 }>;

/** Pure-data capture of one player's visible production decision boundary. */
export type JunkProductionSnapshotData = Readonly<{
  view: Readonly<{
    seat: 0 | 1 | 2 | 3;
    hand: readonly TileRef[];
    wallCount: number;
    currentSeat: 0 | 1 | 2 | 3;
    dealer: 0 | 1 | 2 | 3;
    phase: JunkPhase;
    seats: readonly Readonly<{
      handCount: number;
      melds: readonly SnapshotMeld[];
      discards: readonly SnapshotDiscard[];
      justDrawn: boolean;
    }>[];
    justDrawn?: TileRef;
    lastDiscard?: Readonly<{ seat: 0 | 1 | 2 | 3; tile: TileRef }>;
  }>;
  legalActions: readonly Readonly<{ type: "discard"; tile: TileRef }>[];
}>;

export type JunkSnapshotDataRegistry = Readonly<Record<string, JunkProductionSnapshotData>>;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(`INVALID_SNAPSHOT_DATA: ${message}`);
};

const tileId = ({ kind, copy }: TileRef): number => {
  assert(Number.isInteger(copy) && copy >= 0 && copy < 4, `${kind} copy is invalid`);
  return tileIdOf(kind, copy);
};

const createMeld = (meld: SnapshotMeld): Meld => ({
  type: meld.type,
  tiles: meld.tiles.map(tileId),
  ...(meld.from === undefined ? {} : { from: meld.from }),
});

const createDiscard = (discard: SnapshotDiscard): DiscardEntry => ({
  tile: tileId(discard.tile),
  ...(discard.claimedBy === undefined ? {} : { claimedBy: discard.claimedBy }),
});

const normalizeJunkVisibleDecision = (
  scenario: CalibrationScenario,
  data: JunkProductionSnapshotData,
  sourceKind: "snapshot" | "generated",
): NormalizedCalibrationScenario<JunkProductionFixtureInput> => {
  if (scenario.source.kind !== sourceKind) {
    throw new Error(`INVALID_SNAPSHOT_DATA: scenario source must be ${sourceKind}`);
  }
  assert(data.view.seats.length === 4, "exactly four seat snapshots are required");
  const view: JunkPlayerView = {
    seat: data.view.seat,
    hand: data.view.hand.map(tileId),
    wallCount: data.view.wallCount,
    currentSeat: data.view.currentSeat,
    dealer: data.view.dealer,
    phase: data.view.phase,
    seats: data.view.seats.map((seat) => ({
      handCount: seat.handCount,
      melds: seat.melds.map(createMeld),
      discards: seat.discards.map(createDiscard),
      justDrawn: seat.justDrawn,
    })),
    ...(data.view.justDrawn ? { justDrawn: tileId(data.view.justDrawn) } : {}),
    ...(data.view.lastDiscard
      ? {
          lastDiscard: {
            seat: data.view.lastDiscard.seat,
            tile: tileId(data.view.lastDiscard.tile),
          },
        }
      : {}),
  };
  const legalActions: JunkAction[] = data.legalActions.map((action) => ({
    type: "discard",
    tile: tileId(action.tile),
  }));
  const handIds = new Set(view.hand);
  assert(
    legalActions.every((action) => action.type !== "discard" || handIds.has(action.tile)),
    "every discard action must reference a tile in hand",
  );
  return { scenario, input: { view, legalActions }, contentHash: contentHashOf(data) };
};

export const normalizeJunkSnapshot = (
  scenario: CalibrationScenario,
  data: JunkProductionSnapshotData,
): NormalizedCalibrationScenario<JunkProductionFixtureInput> =>
  normalizeJunkVisibleDecision(scenario, data, "snapshot");

export const normalizeJunkGeneratedDecision = (
  scenario: CalibrationScenario,
  data: JunkProductionSnapshotData,
): NormalizedCalibrationScenario<JunkProductionFixtureInput> => {
  assert(data.view.phase === "playing", "generated decision must be in playing phase");
  assert(
    data.view.currentSeat === data.view.seat,
    "generated decision must belong to current seat",
  );
  assert(data.view.hand.length === 14, "generated concealed hand must contain 14 tiles");
  assert(
    data.view.seats.every(({ melds }) => melds.length === 0),
    "generated sample has no melds",
  );
  assert(
    data.legalActions.length === data.view.hand.length,
    "generated actions must cover the hand",
  );
  const handRefs = new Set(data.view.hand.map(({ kind, copy }) => `${kind}:${copy}`));
  assert(handRefs.size === data.view.hand.length, "generated hand contains duplicate TileIds");
  assert(
    data.legalActions.every(({ tile }) => handRefs.has(`${tile.kind}:${tile.copy}`)),
    "generated actions must reference the hand",
  );
  assert(
    new Set(data.legalActions.map(({ tile }) => `${tile.kind}:${tile.copy}`)).size ===
      data.legalActions.length,
    "generated actions must be unique",
  );
  return normalizeJunkVisibleDecision(scenario, data, "generated");
};

export const createJunkSnapshotProvider = (
  manifest: CalibrationManifest,
  registry: JunkSnapshotDataRegistry,
) => ({
  resolve: (scenario: CalibrationScenario) => {
    if (scenario.source.kind !== "snapshot") {
      throw new Error(`UNSUPPORTED_SCENARIO_SOURCE: ${scenario.source.kind}`);
    }
    const data = registry[scenario.source.snapshotId];
    if (!data) throw new Error(`SNAPSHOT_DATA_NOT_FOUND: ${scenario.source.snapshotId}`);
    return normalizeJunkSnapshot(scenario, data);
  },
  manifest,
});
