import assert from "node:assert/strict";
import { test } from "vitest";
import { createPrng, nextInt } from "./prng.ts";
import {
  buildSuitTable,
  HONOR_SUIT_LENGTH,
  MAX_REAL_HAND_TILES,
  NUMBER_SUIT_LENGTH,
  SLOTS_PER_VECTOR,
  type SuitTable,
} from "./shanten-suit-table.ts";

/**
 * 独立的第二份参考实现——只用来交叉校验 shanten-suit-table.ts 的
 * `buildSuitTable`/`solveSuitVector`，故意写得不一样（字符串 key 的
 * `Map` memo + 每个分支都拷贝一份新 `counts` 数组，而不是扁平数组下标 +
 * 原地回溯），降低"两份实现抄错同一个地方"的风险。逻辑上是
 * `standardShantenByRecursion` 的 `search` 分支限制在单一花色区间跑、不套
 * 终态公式、把 (Δmelds,exitPair)→最大Δtatsu 记下来。
 */
const referenceSolve = (
  counts: readonly number[],
  pair: 0 | 1,
  hasRunLogic: boolean,
  memo: Map<string, Int8Array>,
): Int8Array => {
  const key = `${counts.join(",")}/${pair}`;
  const cached = memo.get(key);
  if (cached) return cached;

  const idx = counts.findIndex((count) => count > 0);
  const result = new Int8Array(10).fill(-1);
  if (idx === -1) {
    result[pair * 5] = 0;
    memo.set(key, result);
    return result;
  }

  const suitLength = counts.length;
  const withDelta = (mutations: [number, number][]): number[] => {
    const next = [...counts];
    for (const [index, delta] of mutations) next[index] = (next[index] ?? 0) - delta;
    return next;
  };
  const merge = (sub: Int8Array, deltaMeldsShift: number, deltaTatsuShift: number) => {
    for (let exitBit = 0; exitBit < 2; exitBit += 1) {
      const base = exitBit * 5;
      for (let dm = 0; dm <= 4; dm += 1) {
        const dt = sub[base + dm]!;
        if (dt < 0) continue;
        const newDm = dm + deltaMeldsShift;
        if (newDm > 4) continue;
        const newDt = dt + deltaTatsuShift;
        if (newDt > result[base + newDm]!) result[base + newDm] = newDt;
      }
    }
  };

  if ((counts[idx] ?? 0) >= 3) {
    merge(referenceSolve(withDelta([[idx, 3]]), pair, hasRunLogic, memo), 1, 0);
  }
  if (hasRunLogic && idx <= suitLength - 3) {
    const second = idx + 1;
    const third = idx + 2;
    if ((counts[second] ?? 0) > 0 && (counts[third] ?? 0) > 0) {
      merge(
        referenceSolve(
          withDelta([
            [idx, 1],
            [second, 1],
            [third, 1],
          ]),
          pair,
          hasRunLogic,
          memo,
        ),
        1,
        0,
      );
    }
  }
  if ((counts[idx] ?? 0) >= 2) {
    const nextPair = pair === 0 ? 1 : pair;
    merge(referenceSolve(withDelta([[idx, 2]]), nextPair, hasRunLogic, memo), 0, 0);
    if (pair !== 0) merge(referenceSolve(withDelta([[idx, 2]]), pair, hasRunLogic, memo), 0, 1);
  }
  if (hasRunLogic) {
    const adjacent = idx + 1;
    const gapped = idx + 2;
    if (idx <= suitLength - 2 && (counts[adjacent] ?? 0) > 0) {
      merge(
        referenceSolve(
          withDelta([
            [idx, 1],
            [adjacent, 1],
          ]),
          pair,
          hasRunLogic,
          memo,
        ),
        0,
        1,
      );
    }
    if (idx <= suitLength - 3 && (counts[gapped] ?? 0) > 0) {
      merge(
        referenceSolve(
          withDelta([
            [idx, 1],
            [gapped, 1],
          ]),
          pair,
          hasRunLogic,
          memo,
        ),
        0,
        1,
      );
    }
  }
  merge(referenceSolve(withDelta([[idx, 1]]), pair, hasRunLogic, memo), 0, 0);

  memo.set(key, result);
  return result;
};

/** 把 buildSuitTable 的两级存储（indexMap + 紧凑 data）重建成跟
 * referenceSolve 一样的 10-slot [exit0(5),exit1(5)] 格式，方便直接比较。
 * `indexMap[vectorIndex] === -1`（从未建过，总张数 >14 被剪掉）时显式返回
 * 全哨兵——不能让它落到下面的越界读取里：越界读 `Int8Array` 返回
 * `undefined`，再赋值进新建的 `Int8Array` 会被强制转成 0，不是 -1，会跟
 * "全哨兵"这个预期悄悄对不上。 */
const extractResult = (table: SuitTable, vectorIndex: number, pair: 0 | 1): Int8Array => {
  const out = new Int8Array(10).fill(-1);
  const compactIndex = table.indexMap[vectorIndex]!;
  if (compactIndex < 0) return out;
  const base = compactIndex * SLOTS_PER_VECTOR;
  const data = table.data;
  if (pair === 1) {
    for (let dm = 0; dm <= 4; dm += 1) out[5 + dm] = data[base + dm]!; // withEntryPair1
  } else {
    for (let dm = 0; dm <= 4; dm += 1) out[dm] = data[base + 5 + dm]!; // entryPair0ExitPair0
    for (let dm = 0; dm <= 4; dm += 1) out[5 + dm] = data[base + 10 + dm]!; // entryPair0ExitPair1
  }
  return out;
};

const countsFromIndex = (index: number, suitLength: number): number[] => {
  const counts = new Array<number>(suitLength).fill(0);
  let remaining = index;
  for (let i = 0; i < suitLength; i += 1) {
    counts[i] = remaining % 5;
    remaining = Math.floor(remaining / 5);
  }
  return counts;
};

test("honor table matches the reference implementation for hand-picked vectors", () => {
  const table = buildSuitTable(HONOR_SUIT_LENGTH, false);
  const memo = new Map<string, Int8Array>();
  const samples: number[][] = [
    [0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 0, 0],
    [2, 2, 2, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [3, 3, 0, 0, 0, 0, 0],
  ];
  for (const counts of samples) {
    const vectorIndex = counts.reduceRight((acc, count) => acc * 5 + count, 0);
    for (const pair of [0, 1] as const) {
      assert.deepEqual(
        [...extractResult(table, vectorIndex, pair)],
        [...referenceSolve(counts, pair, false, memo)],
      );
    }
  }
});

/** >14 张的向量是 `buildSuitTable` 故意不建的（真实手牌单个花色不可能超过
 * 14 张，见该函数文档）——差分测试要把这类向量单独分支处理：不跟参考实现
 * 比较（参考实现没有这条剪枝，会算出真实答案，跟故意留的哨兵值不一致），
 * 改成断言表里就是全哨兵值，把这条剪枝边界本身也纳入验证范围。 */
const ALL_SENTINEL = new Array<number>(10).fill(-1);

test(
  "honor table matches the reference implementation for all 5^7 vectors x 2 entryPair (or is the intentional >14 sentinel)",
  { tags: ["slow"] },
  () => {
    const table = buildSuitTable(HONOR_SUIT_LENGTH, false);
    const memo = new Map<string, Int8Array>();
    const vectorCount = 5 ** HONOR_SUIT_LENGTH;
    for (let vectorIndex = 0; vectorIndex < vectorCount; vectorIndex += 1) {
      const counts = countsFromIndex(vectorIndex, HONOR_SUIT_LENGTH);
      const total = counts.reduce((sum, count) => sum + count, 0);
      for (const pair of [0, 1] as const) {
        const actual = [...extractResult(table, vectorIndex, pair)];
        if (total > MAX_REAL_HAND_TILES) {
          assert.deepEqual(
            actual,
            ALL_SENTINEL,
            `expected sentinel for pruned vector ${vectorIndex}`,
          );
          continue;
        }
        assert.deepEqual(
          actual,
          [...referenceSolve(counts, pair, false, memo)],
          `mismatch at vector ${vectorIndex} (${counts.join(",")}) pair=${pair}`,
        );
      }
    }
  },
);

test(
  "number-suit (m/p/s) table matches the reference implementation on a large random sample (or is the intentional >14 sentinel)",
  { tags: ["slow"] },
  () => {
    // 5^9=1,953,125 个向量做不到穷举，用大样本随机抽样；种子固定，失败可复现。
    const table = buildSuitTable(NUMBER_SUIT_LENGTH, true);
    const memo = new Map<string, Int8Array>();
    let prng = createPrng(20260807);
    const sampleCount = 20000;
    for (let trial = 0; trial < sampleCount; trial += 1) {
      const counts = new Array<number>(NUMBER_SUIT_LENGTH);
      let total = 0;
      for (let i = 0; i < NUMBER_SUIT_LENGTH; i += 1) {
        const step = nextInt(prng, 5);
        prng = step.prng;
        counts[i] = step.value;
        total += step.value;
      }
      const vectorIndex = counts.reduceRight((acc, count) => acc * 5 + count, 0);
      for (const pair of [0, 1] as const) {
        const actual = [...extractResult(table, vectorIndex, pair)];
        if (total > MAX_REAL_HAND_TILES) {
          assert.deepEqual(
            actual,
            ALL_SENTINEL,
            `expected sentinel for pruned vector ${vectorIndex}`,
          );
          continue;
        }
        assert.deepEqual(
          actual,
          [...referenceSolve(counts, pair, true, memo)],
          `mismatch at vector ${vectorIndex} (${counts.join(",")}) pair=${pair}`,
        );
      }
    }
  },
);

test("buildSuitTable: mirror symmetry — a vector and its rank-reversed counterpart store identical results", () => {
  const table = buildSuitTable(NUMBER_SUIT_LENGTH, true);
  // 246m (2m,4m,6m 各一张) 反转后是 468m（4m,6m,8m 各一张）——同一个坎张结构，
  // 只是整体在 rank 轴上平移到另一头，结果应该逐位相同。
  const original = [0, 1, 0, 1, 0, 1, 0, 0, 0]; // 2m,4m,6m
  const mirrored = [0, 0, 0, 1, 0, 1, 0, 1, 0]; // 4m,6m,8m
  const originalIndex = original.reduceRight((acc, count) => acc * 5 + count, 0);
  const mirroredIndex = mirrored.reduceRight((acc, count) => acc * 5 + count, 0);
  for (const pair of [0, 1] as const) {
    assert.deepEqual(
      [...extractResult(table, originalIndex, pair)],
      [...extractResult(table, mirroredIndex, pair)],
    );
  }
});

test("buildSuitTable: vectors with total tile count over 14 are left as sentinel (never queried by real hands)", () => {
  const table = buildSuitTable(NUMBER_SUIT_LENGTH, true);
  const maxedOut = new Array<number>(NUMBER_SUIT_LENGTH).fill(4); // 36 张，远超 14
  const vectorIndex = maxedOut.reduceRight((acc, count) => acc * 5 + count, 0);
  for (const pair of [0, 1] as const) {
    assert.deepEqual([...extractResult(table, vectorIndex, pair)], ALL_SENTINEL);
  }
});
