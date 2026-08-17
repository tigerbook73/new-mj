import {
  tileIdOf,
  type JunkAction,
  type JunkPhase,
  type JunkPlayerView,
  type TileKind,
} from "@new-mj/core";
import { contentHashOf } from "./hash.ts";
import type { CalibrationScenario } from "../../evaluation/types.ts";
import type { JunkProductionFixture } from "./fixture-provider.ts";

type FixtureActionData = Readonly<{ type: "discard"; kind: TileKind; copy: number }>;

export type JunkProductionFixtureData = Readonly<{
  input: Readonly<{
    seat: 0 | 1 | 2 | 3;
    hand: readonly TileKind[];
    wallCount: number;
    currentSeat: 0 | 1 | 2 | 3;
    dealer: 0 | 1 | 2 | 3;
    phase: JunkPhase;
    seats: readonly Readonly<{
      handCount: number;
      melds: readonly unknown[];
      discards: readonly unknown[];
      justDrawn: boolean;
    }>[];
    legalActions: readonly FixtureActionData[];
  }>;
}>;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(`INVALID_FIXTURE_DATA: ${message}`);
};

export const createJunkProductionFixture = (
  data: JunkProductionFixtureData,
  scenario: CalibrationScenario,
): JunkProductionFixture => {
  if (scenario.source.kind !== "fixture") {
    throw new Error(`INVALID_FIXTURE_DATA: scenario source must be fixture`);
  }
  assert(data.input.seats.length === 4, "exactly four seat snapshots are required");

  const copies = new Map<TileKind, number>();
  const tileId = (kind: TileKind, copy?: number): number => {
    const nextCopy = copy ?? copies.get(kind) ?? 0;
    assert(Number.isInteger(nextCopy) && nextCopy >= 0 && nextCopy < 4, `${kind} copy is invalid`);
    if (copy === undefined) copies.set(kind, nextCopy + 1);
    return tileIdOf(kind, nextCopy);
  };
  const hand = data.input.hand.map((kind) => tileId(kind));
  const legalActions: JunkAction[] = data.input.legalActions.map((action) => ({
    type: "discard",
    tile: tileIdOf(action.kind, action.copy),
  }));
  const view: JunkPlayerView = {
    seat: data.input.seat,
    hand,
    wallCount: data.input.wallCount,
    currentSeat: data.input.currentSeat,
    dealer: data.input.dealer,
    phase: data.input.phase,
    seats: data.input.seats.map((seat) => ({ ...seat, melds: [], discards: [] })),
  };
  const contentHash = contentHashOf(data);
  return { scenario, input: { view, legalActions }, contentHash };
};
