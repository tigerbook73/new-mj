import assert from "node:assert/strict";
import { test } from "vitest";
import {
  STANDARD_TILE_SET,
  allTileIds,
  sortTileIdsForDisplay,
  sortWinningGroupsForDisplay,
  tileIdOf,
} from "../index.ts";

test("standard tile set has 136 stable ids", () => {
  assert.equal(STANDARD_TILE_SET.size, 136);
  assert.deepEqual(allTileIds().slice(0, 4), [0, 1, 2, 3]);
  assert.equal(STANDARD_TILE_SET.kindOf(tileIdOf("1m", 0)), "1m");
  assert.equal(STANDARD_TILE_SET.kindOf(tileIdOf("7z", 3)), "7z");
});

test("sortTileIdsForDisplay orders by m -> p -> s -> z then rank, stable on ties", () => {
  const shuffled = [tileIdOf("7z", 0), tileIdOf("1m", 2), tileIdOf("1m", 0), tileIdOf("3s", 1)];
  const sorted = sortTileIdsForDisplay(shuffled);
  assert.deepEqual(
    sorted.map((id) => STANDARD_TILE_SET.kindOf(id)),
    ["1m", "1m", "3s", "7z"],
  );
  // Both 1m copies tie on kind — the earlier-appearing copy (index 1, "1m",2)
  // must stay before the later one (index 2, "1m",0), not get reordered by id.
  assert.deepEqual(sorted.slice(0, 2), [tileIdOf("1m", 2), tileIdOf("1m", 0)]);
});

test("sortWinningGroupsForDisplay sorts melds ascending by kind and puts the jiang last", () => {
  const groups = sortWinningGroupsForDisplay([
    ["5z", "5z"],
    ["7m", "8m", "9m"],
    ["3p", "3p", "3p"],
  ]);
  assert.deepEqual(groups, [
    ["7m", "8m", "9m"],
    ["3p", "3p", "3p"],
    ["5z", "5z"],
  ]);
});

test("sortWinningGroupsForDisplay leaves seven-pairs groups sorted with no jiang extracted", () => {
  const groups = sortWinningGroupsForDisplay([
    ["9s", "9s"],
    ["2m", "2m", "2m", "2m"],
    ["1m", "1m"],
  ]);
  assert.deepEqual(groups, [
    ["1m", "1m"],
    ["2m", "2m", "2m", "2m"],
    ["9s", "9s"],
  ]);
});
