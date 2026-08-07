import assert from "node:assert/strict";
import { test } from "vitest";
import { createPrng, shuffle } from "./prng.ts";
import {
  computeShanten,
  isTingpai,
  sevenPairsShanten,
  shantenWithExposedMelds,
  standardShanten,
  ukeire,
} from "./shanten.ts";
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

test("computeShanten: seven-pairs option changes the selected family", () => {
  const hand = ["1z", "2z", "3z", "4z", "5z", "6z", "7z"].flatMap((kind) => [
    id(kind as (typeof TILE_KINDS)[number]),
    id(kind as (typeof TILE_KINDS)[number], 1),
  ]);
  assert.equal(computeShanten(hand, withSevenPairs), -1);
  assert.ok(computeShanten(hand, standardOnly) > -1);
});

test("isTingpai and ukeire report only tiles that can immediately win", () => {
  const hand = ids(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "1s", "1s"]);
  assert.equal(isTingpai(hand, standardOnly), true);
  assert.deepEqual(ukeire(hand, standardOnly), ["1p", "1s"]);
});

test("shantenWithExposedMelds: usable tatsu is capped by exposed melds, not just concealed melds", () => {
  // 1 副露 + 4 搭子（1m2m/4m5m/7m8m/1p2p，互不相邻不会拼成面子）+ 1 雀头（1s1s），
  // 10 张手牌。standardShanten 内部 `min(tatsu, 4-melds)` 只看得到手牌自己找到
  // 的 0 个面子，把 4 个搭子全当有效，算出 3 向听；再套用过时的
  // `- meldCount*2` 事后修正会得到 1 向听——但副露已经占了 1 个面子位，手牌
  // 里真正能计费的搭子上限应该是 4-1=3 个，正确答案是 2 向听。
  const concealed = ids(["1m", "2m", "4m", "5m", "7m", "8m", "1p", "2p", "1s", "1s"]);
  assert.equal(shantenWithExposedMelds(concealed, 1), 2);
  assert.equal(standardShanten(concealed) - 1 * 2, 1);
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
      computeShanten(hand, withSevenPairs) === -1,
      isStandardWinningHand(hand, STANDARD_TILE_SET) ||
        isSevenPairsWinningHand(hand, STANDARD_TILE_SET),
    );
  }
});

test("shanten property: every ukeire strictly reduces shanten", { tags: ["slow"] }, () => {
  let prng = createPrng(20260803);
  const allIds = allTileIds();
  for (let trial = 0; trial < 2500; trial += 1) {
    const shuffled = shuffle(allIds, prng);
    prng = shuffled.prng;
    const hand = shuffled.items.slice(0, 13);
    const current = computeShanten(hand, withSevenPairs);
    for (const kind of ukeire(hand, withSevenPairs)) {
      assert.ok(computeShanten([...hand, id(kind)], withSevenPairs) < current);
    }
  }
});
