import assert from "node:assert/strict";
import { test } from "vitest";
import {
  STANDARD_TILE_SET,
  allTileIds,
  assertContainerUniqueness,
  assertTileConservation,
  createPrng,
  createEvent,
  createWall,
  drawFromHead,
  drawFromTail,
  tileIdOf,
  nextEventSeq,
  type SeatState,
} from "@/index.ts";

// assertContainerUniqueness/assertTileConservation only ever read
// { wall, seats } (see lib/invariants.ts) — no need for a full ruleset state.
type TileContainerState = { wall: number[]; seats: SeatState[] };

const emptyState = (wall: number[], seats: SeatState[]): TileContainerState => ({ wall, seats });

const emptySeats = (): SeatState[] =>
  [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));

test("standard tile set has 136 stable ids", () => {
  assert.equal(STANDARD_TILE_SET.size, 136);
  assert.deepEqual(allTileIds().slice(0, 4), [0, 1, 2, 3]);
  assert.equal(STANDARD_TILE_SET.kindOf(tileIdOf("1m", 0)), "1m");
  assert.equal(STANDARD_TILE_SET.kindOf(tileIdOf("7z", 3)), "7z");
});

test("PRNG is deterministic and serializable", () => {
  const first = createWall(createPrng(42));
  const second = createWall(createPrng(42));
  assert.deepEqual(first, second);
  const restored = createWall({ ...first.prng });
  const continued = createWall(first.prng);
  assert.deepEqual(restored, continued);
});

test("wall draws immutably from head and tail", () => {
  const wall = [1, 2, 3];
  assert.deepEqual(drawFromHead(wall), { tile: 1, wall: [2, 3] });
  assert.deepEqual(drawFromTail(wall), { tile: 3, wall: [1, 2] });
  assert.deepEqual(wall, [1, 2, 3]);
});

test("event sequence is explicit and monotonic", () => {
  assert.equal(nextEventSeq(0), 1);
  assert.deepEqual(createEvent(1, { type: "public" }, { type: "Started" }), {
    seq: 1,
    visibility: { type: "public" },
    payload: { type: "Started" },
  });
  assert.throws(() => nextEventSeq(-1), { message: "INVALID_EVENT_SEQUENCE" });
});

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
