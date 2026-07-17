import assert from "node:assert/strict";
import { test } from "vitest";
import {
  STANDARD_TILE_SET,
  allTileIds,
  assertContainerUniqueness,
  assertTileConservation,
  type SeatState,
} from "@/index";

// assertContainerUniqueness/assertTileConservation only ever read
// { wall, seats } (see lib/invariants.ts) — no need for a full ruleset state.
type TileContainerState = { wall: number[]; seats: SeatState[] };

const emptyState = (wall: number[], seats: SeatState[]): TileContainerState => ({ wall, seats });

const emptySeats = (): SeatState[] =>
  [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));

test("conservation accepts a complete state and excludes tombstones", () => {
  const seats = emptySeats();
  seats[0]!.melds.push({ type: "peng", tiles: [0, 1, 2], from: 1 });
  seats[1]!.discards.push({ tile: 2, claimedBy: 0 });
  const physical = new Set([0, 1, 2]);
  const wall = allTileIds().filter((id) => !physical.has(id));
  const state = emptyState(wall, seats);
  assertContainerUniqueness(state);
  assertTileConservation(state);
});

test("invariants reject duplicate and orphaned physical tiles", () => {
  const duplicate = emptySeats();
  duplicate[0]!.hand.push(1);
  duplicate[1]!.hand.push(1);
  assert.throws(
    () =>
      assertContainerUniqueness(
        emptyState(
          allTileIds().filter((id) => id !== 1),
          duplicate,
        ),
      ),
    {
      code: "DUPLICATE_TILE",
    },
  );

  const orphan = emptySeats();
  orphan[1]!.discards.push({ tile: 1, claimedBy: 0 });
  assert.throws(
    () =>
      assertContainerUniqueness(
        emptyState(
          allTileIds().filter((id) => id !== 1),
          orphan,
        ),
      ),
    {
      code: "ORPHAN_TOMBSTONE",
    },
  );
});

test("conservation counts extraTiles as a container (e.g. a variant win snapshot)", () => {
  const seats = emptySeats();
  const physical = new Set([0, 1]);
  const wall = allTileIds().filter((id) => !physical.has(id));
  const state = emptyState(wall, seats);
  assertContainerUniqueness(state, STANDARD_TILE_SET, () => [0, 1]);
  assertTileConservation(state, STANDARD_TILE_SET, () => [0, 1]);
});

test("extraTiles overlapping another container is rejected as a duplicate", () => {
  const seats = emptySeats();
  seats[0]!.hand.push(0);
  const wall = allTileIds().filter((id) => id !== 0);
  const state = emptyState(wall, seats);
  assert.throws(() => assertContainerUniqueness(state, STANDARD_TILE_SET, () => [0]), {
    code: "DUPLICATE_TILE",
  });
});
