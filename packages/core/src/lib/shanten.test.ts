import assert from "node:assert/strict";
import { test } from "vitest";
import { createPrng, shuffle } from "./prng.ts";
import { isTingpai, junkShanten, sevenPairsShanten, standardShanten, ukeire } from "./shanten.ts";
import { isSevenPairsWinningHand, isStandardWinningHand } from "./standard-hand.ts";
import { STANDARD_TILE_SET, TILE_KINDS, allTileIds, tileIdOf } from "./tiles.ts";

const id = (kind: (typeof TILE_KINDS)[number], copy = 0) => tileIdOf(kind, copy);
const ids = (kinds: readonly (typeof TILE_KINDS)[number][]) => {
  const copies = new Map<(typeof TILE_KINDS)[number], number>();
  return kinds.map((kind) => {
    const copy = copies.get(kind) ?? 0;
    copies.set(kind, copy + 1);
    return id(kind, copy);
  });
};
const standardOnly = { sevenPairs: false } as const;
const withSevenPairs = { sevenPairs: true } as const;

test("standardShanten: complete standard hand is -1 and a one-away hand is 0", () => {
  const winning = ids([
    "1m",
    "2m",
    "3m",
    "4m",
    "5m",
    "6m",
    "7m",
    "8m",
    "9m",
    "1p",
    "1p",
    "1s",
    "1s",
    "1s",
  ]);
  assert.equal(standardShanten(winning), -1);
  assert.equal(standardShanten(winning.slice(0, -1)), 0);
});

test("sevenPairsShanten: formula handles distinct kinds and a seven-pairs hand", () => {
  const hand = ["1z", "2z", "3z", "4z", "5z", "6z", "7z"].flatMap((kind) => [
    id(kind as (typeof TILE_KINDS)[number]),
    id(kind as (typeof TILE_KINDS)[number], 1),
  ]);
  assert.equal(sevenPairsShanten(hand), -1);
  assert.equal(sevenPairsShanten(hand.slice(0, -1)), 0);
});

test("junkShanten: seven-pairs option changes the selected family", () => {
  const hand = ["1z", "2z", "3z", "4z", "5z", "6z", "7z"].flatMap((kind) => [
    id(kind as (typeof TILE_KINDS)[number]),
    id(kind as (typeof TILE_KINDS)[number], 1),
  ]);
  assert.equal(junkShanten(hand, withSevenPairs), -1);
  assert.ok(junkShanten(hand, standardOnly) > -1);
});

test("isTingpai and ukeire report only tiles that can immediately win", () => {
  const hand = ids(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "1s", "1s"]);
  assert.equal(isTingpai(hand, standardOnly), true);
  assert.deepEqual(ukeire(hand, standardOnly), ["1p", "1s"]);
});

test("shanten property: -1 is equivalent to the direct winning checks", () => {
  let prng = createPrng(20260802);
  const allIds = allTileIds();
  for (let trial = 0; trial < 2500; trial += 1) {
    const shuffled = shuffle(allIds, prng);
    prng = shuffled.prng;
    const hand = shuffled.items.slice(0, 14);
    assert.equal(standardShanten(hand) === -1, isStandardWinningHand(hand, STANDARD_TILE_SET));
    assert.equal(sevenPairsShanten(hand) === -1, isSevenPairsWinningHand(hand, STANDARD_TILE_SET));
    assert.equal(
      junkShanten(hand, withSevenPairs) === -1,
      isStandardWinningHand(hand, STANDARD_TILE_SET) ||
        isSevenPairsWinningHand(hand, STANDARD_TILE_SET),
    );
  }
});

test("shanten property: every ukeire strictly reduces shanten", () => {
  let prng = createPrng(20260803);
  const allIds = allTileIds();
  for (let trial = 0; trial < 2500; trial += 1) {
    const shuffled = shuffle(allIds, prng);
    prng = shuffled.prng;
    const hand = shuffled.items.slice(0, 13);
    const current = junkShanten(hand, withSevenPairs);
    for (const kind of ukeire(hand, withSevenPairs)) {
      assert.ok(junkShanten([...hand, id(kind)], withSevenPairs) < current);
    }
  }
}, 30_000);
