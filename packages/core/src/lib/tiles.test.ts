import assert from "node:assert/strict";
import { test } from "vitest";
import { STANDARD_TILE_SET, allTileIds, tileIdOf } from "../index.ts";

test("standard tile set has 136 stable ids", () => {
  assert.equal(STANDARD_TILE_SET.size, 136);
  assert.deepEqual(allTileIds().slice(0, 4), [0, 1, 2, 3]);
  assert.equal(STANDARD_TILE_SET.kindOf(tileIdOf("1m", 0)), "1m");
  assert.equal(STANDARD_TILE_SET.kindOf(tileIdOf("7z", 3)), "7z");
});
