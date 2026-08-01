import assert from "node:assert/strict";
import { test } from "vitest";
import { createPrng, shuffle } from "./prng.ts";
import { STANDARD_TILE_SET, TILE_KINDS, allTileIds, tileIdOf } from "./tiles.ts";
import {
  decomposeSevenPairsWinningHand,
  decomposeStandardWinningHand,
  isSevenPairsWinningHand,
  isStandardWinningHand,
} from "./win.ts";

const sortedKinds = (list: readonly (typeof TILE_KINDS)[number][]) => [...list].sort();

test("decomposeStandardWinningHand: fully real hand forms 4 melds + pair", () => {
  const tiles = [
    tileIdOf("1m", 0),
    tileIdOf("2m", 0),
    tileIdOf("3m", 0),
    tileIdOf("4m", 0),
    tileIdOf("5m", 0),
    tileIdOf("6m", 0),
    tileIdOf("7m", 0),
    tileIdOf("8m", 0),
    tileIdOf("9m", 0),
    tileIdOf("1p", 0),
    tileIdOf("1p", 1),
    tileIdOf("1s", 0),
    tileIdOf("1s", 1),
    tileIdOf("1s", 2),
  ];
  const groups = decomposeStandardWinningHand(tiles, STANDARD_TILE_SET);
  assert.ok(groups);
  assert.deepEqual(
    sortedKinds(groups.flat()),
    sortedKinds(tiles.map((tile) => STANDARD_TILE_SET.kindOf(tile))),
  );
  assert.equal(groups.filter((group) => group.length === 2).length, 1);
});

test("decomposeStandardWinningHand: negative case returns undefined", () => {
  const tiles = [
    tileIdOf("1m", 0),
    tileIdOf("4m", 0),
    tileIdOf("7m", 0),
    tileIdOf("1p", 0),
    tileIdOf("4p", 0),
    tileIdOf("7p", 0),
    tileIdOf("1s", 0),
    tileIdOf("4s", 0),
    tileIdOf("7s", 0),
    tileIdOf("1z", 0),
    tileIdOf("2z", 0),
    tileIdOf("3z", 0),
  ];
  assert.equal(decomposeStandardWinningHand(tiles, STANDARD_TILE_SET), undefined);
});

test("decomposeSevenPairsWinningHand: seven distinct pairs", () => {
  const tiles = ["1m", "2m", "3m", "4m", "5m", "6m", "1z"].flatMap((kind) => [
    tileIdOf(kind as (typeof TILE_KINDS)[number], 0),
    tileIdOf(kind as (typeof TILE_KINDS)[number], 1),
  ]);
  const groups = decomposeSevenPairsWinningHand(tiles, STANDARD_TILE_SET);
  assert.ok(groups);
  assert.equal(groups.length, 7);
  assert.deepEqual(
    sortedKinds(groups.flat()),
    sortedKinds(tiles.map((tile) => STANDARD_TILE_SET.kindOf(tile))),
  );
});

test("decomposeSevenPairsWinningHand: negative case returns undefined", () => {
  const tiles = [
    tileIdOf("1m", 0),
    tileIdOf("1m", 1),
    tileIdOf("1m", 2),
    tileIdOf("2m", 0),
    tileIdOf("2m", 1),
    tileIdOf("3m", 0),
    tileIdOf("3m", 1),
    tileIdOf("4m", 0),
    tileIdOf("4m", 1),
    tileIdOf("5m", 0),
    tileIdOf("5m", 1),
    tileIdOf("6m", 0),
    tileIdOf("6m", 1),
    tileIdOf("7m", 0),
  ];
  assert.equal(decomposeSevenPairsWinningHand(tiles, STANDARD_TILE_SET), undefined);
});

test("decompose functions agree with the boolean checks across random hands (property test)", () => {
  let prng = createPrng(20260801);
  const allIds = allTileIds();
  for (let trial = 0; trial < 500; trial += 1) {
    const shuffled = shuffle(allIds, prng);
    prng = shuffled.prng;
    const standardTiles = shuffled.items.slice(0, 14);
    const standardGroups = decomposeStandardWinningHand(standardTiles, STANDARD_TILE_SET);
    assert.equal(standardGroups !== undefined, isStandardWinningHand(standardTiles, STANDARD_TILE_SET));
    if (standardGroups) {
      assert.deepEqual(
        sortedKinds(standardGroups.flat()),
        sortedKinds(standardTiles.map((tile) => STANDARD_TILE_SET.kindOf(tile))),
      );
    }

    const sevenPairTiles = shuffled.items.slice(14, 28);
    const sevenPairGroups = decomposeSevenPairsWinningHand(sevenPairTiles, STANDARD_TILE_SET);
    assert.equal(sevenPairGroups !== undefined, isSevenPairsWinningHand(sevenPairTiles, STANDARD_TILE_SET));
    if (sevenPairGroups) {
      assert.deepEqual(
        sortedKinds(sevenPairGroups.flat()),
        sortedKinds(sevenPairTiles.map((tile) => STANDARD_TILE_SET.kindOf(tile))),
      );
    }
  }
});
