import assert from "node:assert/strict";
import { test } from "vitest";
import { createPrng, nextInt, shuffle } from "./prng.ts";
import {
  computeShanten,
  evaluateUkeire,
  evaluateUkeireBatch,
  isTingpai,
  sevenPairsShanten,
  shantenWithExposedMelds,
  standardShanten,
  ukeire,
} from "./shanten.ts";
import { isSevenPairsWinningHand, isStandardWinningHand } from "./standard-hand.ts";
import { createTileSet, STANDARD_TILE_SET, TILE_KINDS, allTileIds, tileIdOf } from "./tiles.ts";

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

test("evaluateUkeire combines shanten and ukeire, and batch evaluation deduplicates hands", () => {
  const hand = ids(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "1s", "1s"]);
  const single = evaluateUkeire(hand, standardOnly);
  const batch = evaluateUkeireBatch([
    { tiles: hand, options: standardOnly },
    { tiles: [...hand].reverse(), options: standardOnly },
  ]);
  assert.deepEqual(single, {
    shanten: 0,
    improvingKinds: ["1p", "1s"],
  });
  assert.deepEqual(batch[0], single);
  assert.strictEqual(batch[1], batch[0]);
});

test("ukeire: existingMelds caps usable tatsu the same way shantenWithExposedMelds does", () => {
  // 2 副露 + 2s3s4s（面子）+ 5m7m（嵌张搭子，缺6m）+ 9m9m（雀头），7 张手牌 —
  // 2 副露 + 1 手牌内面子 = 3 面子，只差 5m7m 补 6m 就是 4 面子 + 雀头，向听 0。
  // 2026-08-08 修复前：ukeire 内部硬编码 existingMelds=0 去算候选，把手牌当成
  // 独立的 0 副露 7 张牌评估，摸 9m（凑成 9m9m9m 刻子）在这个错误基准下被判定
  // "降向听"，但按真实的 2 副露基准复算，摸 9m 后向听仍是 0（见下方精确验证），
  // 不该出现在 ukeire 里——只有 6m 才是真正的听牌。
  const concealed = ids(["2s", "3s", "4s", "5m", "7m", "9m", "9m"]);
  assert.equal(shantenWithExposedMelds(concealed, 2), 0);
  assert.equal(
    shantenWithExposedMelds([...concealed, id("9m", 2)], 2),
    0,
    "drawing a third 9m must NOT reduce shanten below 0 with 2 exposed melds",
  );
  assert.equal(shantenWithExposedMelds([...concealed, id("6m")], 2), -1);
  assert.deepEqual(ukeire(concealed, standardOnly, STANDARD_TILE_SET, 2), ["6m"]);
  // existingMelds defaults to 0 — matches the (buggy but now-explicit) behavior
  // for callers that genuinely have no exposed melds, and is what makes this a
  // non-breaking default for every pre-existing call site in this file.
  assert.deepEqual(ukeire(concealed, standardOnly), ["6m", "9m"]);
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

test("standardShanten: table fast path matches the recursive fallback on hand-picked edge cases", () => {
  // fallbackTileSet 跟 STANDARD_TILE_SET 内容一样（34 种/每种4张）但不是同一个
  // 对象，standardShanten 内部按引用相等判断是否走查表快路径——传这个对象会
  // 强制走 standardShantenByRecursion 回退实现，从而能通过公开 API 直接比较
  // 快路径 vs 回退路径，不用导出私有实现细节。
  const fallbackTileSet = createTileSet();
  const zKinds = ["1z", "2z", "3z", "4z", "5z", "6z", "7z"] as const;
  const edgeCases: ReturnType<typeof ids>[] = [
    [],
    ids(["1m", "1m", "1m", "1m"]), // 单 kind 拿满四张
    ids(["1m", "1m", "1m", "1m", "2m", "2m", "2m", "2m", "3m", "3m", "3m", "3m"]), // 数牌重叠拿满
    zKinds.flatMap((kind) => [id(kind), id(kind, 1)]), // 七对型（全字牌）
    ids([...zKinds]), // 字牌为主，各一张
  ];
  for (const hand of edgeCases) {
    for (let existingMelds = 0; existingMelds <= 4; existingMelds += 1) {
      assert.equal(
        standardShanten(hand, STANDARD_TILE_SET, undefined, existingMelds),
        standardShanten(hand, fallbackTileSet, undefined, existingMelds),
        `mismatch for hand [${hand.join(",")}] existingMelds=${existingMelds}`,
      );
    }
  }
});

test(
  "standardShanten: table fast path matches the recursive fallback on a large random sample",
  { tags: ["slow"] },
  () => {
    const fallbackTileSet = createTileSet();
    let prng = createPrng(20260806);
    const allIds = allTileIds();
    for (let trial = 0; trial < 4000; trial += 1) {
      const shuffled = shuffle(allIds, prng);
      prng = shuffled.prng;
      const sizeStep = nextInt(prng, 15); // 手牌大小 0..14 全扫
      prng = sizeStep.prng;
      const hand = shuffled.items.slice(0, sizeStep.value);
      for (let existingMelds = 0; existingMelds <= 4; existingMelds += 1) {
        const fast = standardShanten(hand, STANDARD_TILE_SET, undefined, existingMelds);
        const fallback = standardShanten(hand, fallbackTileSet, undefined, existingMelds);
        assert.equal(
          fast,
          fallback,
          `mismatch at trial ${trial}, hand size ${hand.length}, existingMelds ${existingMelds}`,
        );
      }
    }
  },
);

test(
  "ukeire/isTingpai/shantenWithExposedMelds: table fast path matches the recursive fallback on a large random sample",
  { tags: ["slow"] },
  () => {
    const fallbackTileSet = createTileSet();
    let prng = createPrng(20260807);
    const allIds = allTileIds();
    for (let trial = 0; trial < 2000; trial += 1) {
      const shuffled = shuffle(allIds, prng);
      prng = shuffled.prng;
      const sizeStep = nextInt(prng, 14); // 0..13：ukeire 典型用在打牌前的 13 张手
      prng = sizeStep.prng;
      const hand = shuffled.items.slice(0, sizeStep.value);
      for (const options of [standardOnly, withSevenPairs]) {
        assert.deepEqual(
          ukeire(hand, options, STANDARD_TILE_SET),
          ukeire(hand, options, fallbackTileSet),
          `ukeire mismatch trial ${trial} size ${hand.length} sevenPairs=${options.sevenPairs}`,
        );
        assert.equal(
          isTingpai(hand, options, STANDARD_TILE_SET),
          isTingpai(hand, options, fallbackTileSet),
          `isTingpai mismatch trial ${trial} size ${hand.length} sevenPairs=${options.sevenPairs}`,
        );
      }
      for (let exposedMelds = 0; exposedMelds <= 4; exposedMelds += 1) {
        assert.equal(
          shantenWithExposedMelds(hand, exposedMelds, STANDARD_TILE_SET),
          shantenWithExposedMelds(hand, exposedMelds, fallbackTileSet),
          `shantenWithExposedMelds mismatch trial ${trial} size ${hand.length} exposedMelds=${exposedMelds}`,
        );
      }
    }
  },
);

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
