/**
 * Layer 0：单花色预计算表。把 shanten.ts 里 `standardShantenByRecursion` 的
 * 分支逻辑严格限制在单一花色（m/p/s 共用一张 9-rank 表，z 字牌单独一张
 * 7-kind 表）内跑，输出「entryPair（进入该花色时全局雀头是否已被更早花色
 * 认领）→(Δmelds,exitPair)→最大Δtatsu」，供 Layer B 合并 DP 查表使用。
 *
 * 算法推导与正确性论证（花色间只靠 pair 一个 bit 耦合、melds/tatsu 纯累加、
 * 固定 Δmelds 时只需要最大 Δtatsu 不需要帕累托前沿）见
 * `docs/process/shanten-architecture-plan.md`。三条不变量：
 *   1. 花色间从不交叉（顺子/搭子只在同花色内找，tileSet.kinds 按 m→p→s→z
 *      顺序串行处理），melds/tatsu 是纯累加计数器，只有 pair 跨花色耦合。
 *   2. pair 一旦从 0 变成 1 就不会再变回 0，所以 entryPair=1 的结果里
 *      exitPair=0 恒不可达。
 *   3. 终态公式对 tatsu 单调不增：固定 Δmelds 时更多 Δtatsu 只会更好，不
 *      存在"故意少存"的情形；Δmelds 只保留 0..4——继续往上加面子只会让终态
 *      公式变差，不会在任何合并结果里胜出，所以在每一层递归都可以安全丢弃
 *      Δmelds>4 的分支，不需要等到顶层才裁剪。
 *
 * 建表实现刻意避免逐 (counts,pair) 组合分配独立对象：第一版实现用
 * `(Int8Array|undefined)[]` 存 390 万个各自独立的 `Int8Array(10)`，5^9
 * 数牌表全量建表实测约 3.7 秒、峰值堆内存约 935MB——远超"几十到几百毫秒"
 * 这个可接受量级，绝大部分开销是几百万个小 typed array 对象的分配/GC，
 * 不是算法本身。改成一整块扁平 `Int8Array`（`(vectorIndex*2+pair)*10` 做
 * 下标）+ 递归时直接原地修改/回溯 `counts` 数组（不再每个分支都拷贝一份
 * 新数组）后，实测降到约 1.1 秒、峰值堆内存约 9MB（字牌表约 20ms，可忽略）
 * ——内存问题基本解决，耗时仍比"几十到几百毫秒"高几倍；已确认这部分是懒
 * 加载单例的一次性成本（进程生命周期内只付一次），端到端 profiling（见
 * `docs/process/shanten-architecture-plan.md` §6）显示对真实自对弈整体
 * 耗时的净收益已经很显著（8.75x）。
 *
 * 后续又追加了两个已验证正确、已实测有效的剪枝（`buildSuitTable` 内部）：
 *   1. 总张数 >14 的向量不建表，留哨兵值：任何分支都是从 counts 里减牌再
 *      递归，子状态总张数只会更少不会更多——总张数 >14 的向量不可能是任何
 *      合法（≤14 张）向量的必经之路，也不会被真实手牌的查询路径用到，跳过
 *      它们不影响任何真实场景的结果。
 *   2. rank 反转对称（1↔9、2↔8…5 自对称）：所有分支（刻子/顺子/搭子/雀头
 *      判断）在 rank 反转下语义不变，只需要对 `vectorIndex <=
 *      mirrorVectorIndexOf(counts)` 的一半向量真正调用 `solveSuitVector`，
 *      结果直接镜像复制给另一半。
 * 两条叠加后，数牌表全量建表实测从约 1.1 秒降到约 **290ms**（约 3.8x），
 * 字牌表从约 20ms 降到约 15ms，内存占用没有变化。多线程建表（复用
 * `packages/ai/src/junk/tune-pool.ts` 的 worker_threads 池模式）仍留作后续
 * 按需追加，目前的数字已经足够好，没有必要再加这层复杂度。
 */

import type { TileId } from "./ids.ts";
import type { TileSet } from "./tiles.ts";

export const NUMBER_SUIT_LENGTH = 9;
export const HONOR_SUIT_LENGTH = 7;
const MAX_DELTA_MELDS = 4; // 0..4，共 5 个 slot
const SENTINEL = -1;
/** 扁平 memo 里"这个 (vectorIndex,pair) 还没算过"的哨兵，必须与 SENTINEL
 * （"算过了，但这个 Δmelds/exitPair 组合不可达"）区分开——两者语义不同。 */
const UNSET = -2;

/** counts→base-5 整数下标：Σ counts[i]*5^i（数字下标，不是字符串）。 */
export const vectorIndexOf = (counts: readonly number[]): number => {
  let index = 0;
  for (let i = counts.length - 1; i >= 0; i -= 1) index = index * 5 + (counts[i] ?? 0);
  return index;
};

/**
 * 不实际反转 counts 数组，直接算出"rank 反转后那个向量"的下标：
 * `vectorIndexOf` 是 `Σ counts[i]*5^i`（从高位到低位累乘），这里只是反过来
 * 从低位到高位累乘，等价于 `vectorIndexOf(counts.slice().reverse())`。用于
 * `buildSuitTable` 的镜像对称优化——所有分支（刻子/顺子/搭子/雀头判断）都
 * 只看"是不是同一 rank"或"差 1/2 个 rank"，反转 rank 顺序（1↔9、2↔8…）
 * 不改变这些条件本身，所以 `solveSuitVector(counts,...)` 与
 * `solveSuitVector(反转后的 counts,...)` 结果逐位相同——只需要算一半、镜像
 * 出另一半。这个对称性对字牌（没有顺子/相邻搭子分支，逐位置本来就互相
 * 独立）同样成立，只是字牌表本来就很快，意义不大。
 */
const mirrorVectorIndexOf = (counts: readonly number[]): number => {
  let index = 0;
  for (let i = 0; i < counts.length; i += 1) index = index * 5 + (counts[i] ?? 0);
  return index;
};

export const countsFromVectorIndex = (index: number, suitLength: number): number[] => {
  const counts = new Array<number>(suitLength).fill(0);
  let remaining = index;
  for (let i = 0; i < suitLength; i += 1) {
    counts[i] = remaining % 5;
    remaining = Math.floor(remaining / 5);
  }
  return counts;
};

/**
 * 单个 (counts, entryPair) 的结果：长度 10 的 Int8Array，
 * `[0..4]` = exitPair=0 时 Δmelds 0..4 对应的最大 Δtatsu（-1=不可达），
 * `[5..9]` = exitPair=1 时同上。entryPair=1 时 `[0..4]` 恒为 -1（见上文
 * 不变量 2）。
 */
export type SuitVectorResult = Int8Array;

/**
 * 把 `sub`（flat 里 subBase..subBase+9）的每个可达 (dm,exitPair)→dt，按
 * (meldShift,tatsuShift) 平移后合并进 `into`（flat 里 intoBase..intoBase+9），
 * 取 max。`sub` 在被读取前必须已经算完（后序遍历保证），不会读到 UNSET。
 */
const applyMerge = (
  flat: Int8Array,
  intoBase: number,
  subBase: number,
  meldShift: number,
  tatsuShift: number,
): void => {
  for (let exitBit = 0; exitBit < 2; exitBit += 1) {
    const offset = exitBit * 5;
    for (let dm = 0; dm <= MAX_DELTA_MELDS; dm += 1) {
      const dt = flat[subBase + offset + dm]!;
      if (dt < 0) continue;
      const newDm = dm + meldShift;
      if (newDm > MAX_DELTA_MELDS) continue;
      const newDt = dt + tatsuShift;
      const outIndex = intoBase + offset + newDm;
      if (newDt > flat[outIndex]!) flat[outIndex] = newDt;
    }
  }
};

/**
 * 递归建表核心：把 `standardShantenByRecursion` 的 `search` 分支逻辑限制在
 * 单一花色区间跑，不套终态公式。`flat` 是调用方持有的共享 memo（大小
 * `5^suitLength*2*10`），跨越同一次建表调用的所有 (counts,pair) 组合共享。
 * `counts` 原地修改后回溯（不拷贝新数组）——每个分支：减、递归、（合并）、
 * 加回。返回值是这个 (counts,pair) 结果在 `flat` 里的起始下标，调用方自己
 * 从 `flat[base..base+9]` 读。
 */
export const solveSuitVector = (
  flat: Int8Array,
  counts: number[],
  pair: 0 | 1,
  hasRunLogic: boolean,
): number => {
  const base = (vectorIndexOf(counts) * 2 + pair) * 10;
  if (flat[base] !== UNSET) return base;

  const idx = counts.findIndex((count) => count > 0);
  if (idx === -1) {
    for (let i = 0; i < 10; i += 1) flat[base + i] = SENTINEL;
    flat[base + pair * 5] = 0;
    return base;
  }

  for (let i = 0; i < 10; i += 1) flat[base + i] = SENTINEL;
  const suitLength = counts.length;

  // 1. 刻子
  if ((counts[idx] ?? 0) >= 3) {
    counts[idx] = (counts[idx] ?? 0) - 3;
    const subBase = solveSuitVector(flat, counts, pair, hasRunLogic);
    counts[idx] = (counts[idx] ?? 0) + 3;
    applyMerge(flat, base, subBase, 1, 0);
  }
  // 2. 顺子（只有数牌）
  if (hasRunLogic && idx <= suitLength - 3) {
    const second = idx + 1;
    const third = idx + 2;
    if ((counts[second] ?? 0) > 0 && (counts[third] ?? 0) > 0) {
      counts[idx] = (counts[idx] ?? 0) - 1;
      counts[second] = (counts[second] ?? 0) - 1;
      counts[third] = (counts[third] ?? 0) - 1;
      const subBase = solveSuitVector(flat, counts, pair, hasRunLogic);
      counts[idx] = (counts[idx] ?? 0) + 1;
      counts[second] = (counts[second] ?? 0) + 1;
      counts[third] = (counts[third] ?? 0) + 1;
      applyMerge(flat, base, subBase, 1, 0);
    }
  }
  // 3. 对子：认雀头 /（雀头已被认领时）当搭子——两个分支共享同一次 counts-2
  if ((counts[idx] ?? 0) >= 2) {
    const nextPair = pair === 0 ? 1 : pair;
    counts[idx] = (counts[idx] ?? 0) - 2;
    const subBaseJiang = solveSuitVector(flat, counts, nextPair, hasRunLogic);
    applyMerge(flat, base, subBaseJiang, 0, 0);
    if (pair !== 0) {
      const subBaseTatsu = solveSuitVector(flat, counts, pair, hasRunLogic);
      applyMerge(flat, base, subBaseTatsu, 0, 1);
    }
    counts[idx] = (counts[idx] ?? 0) + 2;
  }
  // 4. 相邻/隔张搭子（只有数牌）
  if (hasRunLogic) {
    const adjacent = idx + 1;
    const gapped = idx + 2;
    if (idx <= suitLength - 2 && (counts[adjacent] ?? 0) > 0) {
      counts[idx] = (counts[idx] ?? 0) - 1;
      counts[adjacent] = (counts[adjacent] ?? 0) - 1;
      const subBase = solveSuitVector(flat, counts, pair, hasRunLogic);
      counts[idx] = (counts[idx] ?? 0) + 1;
      counts[adjacent] = (counts[adjacent] ?? 0) + 1;
      applyMerge(flat, base, subBase, 0, 1);
    }
    if (idx <= suitLength - 3 && (counts[gapped] ?? 0) > 0) {
      counts[idx] = (counts[idx] ?? 0) - 1;
      counts[gapped] = (counts[gapped] ?? 0) - 1;
      const subBase = solveSuitVector(flat, counts, pair, hasRunLogic);
      counts[idx] = (counts[idx] ?? 0) + 1;
      counts[gapped] = (counts[gapped] ?? 0) + 1;
      applyMerge(flat, base, subBase, 0, 1);
    }
  }
  // 5. 单张
  {
    counts[idx] = (counts[idx] ?? 0) - 1;
    const subBase = solveSuitVector(flat, counts, pair, hasRunLogic);
    counts[idx] = (counts[idx] ?? 0) + 1;
    applyMerge(flat, base, subBase, 0, 0);
  }

  return base;
};

/** 单次查询的便捷包装：自己建一个只够放这一次递归的 flat memo，返回一份
 * 独立的 `Int8Array(10)` 拷贝。给测试/临时校验用，不是建表的热路径——批量
 * 建表见 `buildSuitTable`，复用同一块 flat memo，不逐次查询各自开一块。 */
export const solveSuitVectorStandalone = (
  counts: readonly number[],
  pair: 0 | 1,
  hasRunLogic: boolean,
): SuitVectorResult => {
  const vectorCount = 5 ** counts.length;
  const flat = new Int8Array(vectorCount * 2 * 10).fill(UNSET);
  const base = solveSuitVector(flat, [...counts], pair, hasRunLogic);
  return flat.slice(base, base + 10);
};

export const SLOTS_PER_VECTOR = 15;

export type SuitTable = {
  suitLength: number;
  hasRunLogic: boolean;
  /** 每个 vectorIndex 存 15 个 Int8：`[0..4]`=withEntryPair1，
   * `[5..9]`=entryPair0ExitPair0，`[10..14]`=entryPair0ExitPair1。 */
  data: Int8Array;
};

/** 一整手牌（不管副露）最多 14 张——单个花色的向量若总张数超过这个数，
 * 不可能是任何真实手牌里"这个花色那部分"的样子（见 `buildSuitTable` 里的
 * 剪枝）。导出给测试用，确保测试断言的边界和实现用的是同一个数。 */
export const MAX_REAL_HAND_TILES = 14;

/** 全量建表：对 `[0, 5^suitLength)` 每个向量都算出 withEntryPair1/
 * entryPair0ExitPair0/entryPair0ExitPair1 三组结果并写进一张扁平 `Int8Array`。
 * m/p/s 传 `(9, true)` 共用同一张表；z 传 `(7, false)`。全程只分配一块 flat
 * memo + 一个复用的 `counts` 缓冲区，不逐向量/逐分支分配新对象。
 *
 * 两个剪枝（均已验证安全，见文件顶部注释）：
 * 1. 总张数 >14 的向量不计算，直接留哨兵值——任何分支都是从 counts 里
 *    减牌再递归，子状态总张数只会更少不会更多，>14 的向量不可能是任何
 *    合法向量的必经之路，也不会被查询路径（真实手牌）用到。
 * 2. rank 反转对称：只对 `vectorIndex <= mirrorVectorIndexOf(counts)` 的
 *    向量真正调用 `solveSuitVector`，算完顺手把同一份结果写进它的镜像
 *    位置；轮到镜像那个下标自己被遍历到时，直接跳过（结果已经在算原始
 *    向量时写过了）。 */
export const buildSuitTable = (suitLength: number, hasRunLogic: boolean): SuitTable => {
  const vectorCount = 5 ** suitLength;
  const flat = new Int8Array(vectorCount * 2 * 10).fill(UNSET);
  const data = new Int8Array(vectorCount * SLOTS_PER_VECTOR).fill(SENTINEL);
  const counts = new Array<number>(suitLength).fill(0);
  for (let vectorIndex = 0; vectorIndex < vectorCount; vectorIndex += 1) {
    let remaining = vectorIndex;
    let total = 0;
    for (let i = 0; i < suitLength; i += 1) {
      counts[i] = remaining % 5;
      total += counts[i]!;
      remaining = Math.floor(remaining / 5);
    }
    if (total > MAX_REAL_HAND_TILES) continue;

    const mirrorIndex = mirrorVectorIndexOf(counts);
    if (mirrorIndex < vectorIndex) continue; // 镜像那边已经算过、写过这份结果了

    const base0 = solveSuitVector(flat, counts, 0, hasRunLogic);
    const base1 = solveSuitVector(flat, counts, 1, hasRunLogic);
    const outBase = vectorIndex * SLOTS_PER_VECTOR;
    for (let dm = 0; dm <= MAX_DELTA_MELDS; dm += 1) {
      data[outBase + dm] = flat[base1 + 5 + dm]!; // withEntryPair1
      data[outBase + 5 + dm] = flat[base0 + dm]!; // entryPair0ExitPair0
      data[outBase + 10 + dm] = flat[base0 + 5 + dm]!; // entryPair0ExitPair1
    }
    if (mirrorIndex !== vectorIndex) {
      data.copyWithin(mirrorIndex * SLOTS_PER_VECTOR, outBase, outBase + SLOTS_PER_VECTOR);
    }
  }
  return { suitLength, hasRunLogic, data };
};

let numberSuitTableSingleton: SuitTable | undefined;
let honorSuitTableSingleton: SuitTable | undefined;

/**
 * 进程内懒加载单例：第一次真正用到查表快路径（`computeShantenViaTable`）
 * 时才建表，之后同一进程内复用，不在模块 import 时建。原因：
 * `packages/core/vitest.config.ts` 没有关掉 test isolation，Vitest 4 默认
 * 每个测试文件独立 worker/模块注册表——若 import 时就建表，大量测试文件、
 * 以及不需要 shanten 的进程都会各自付一次建表成本。数牌表（m/p/s 共用）
 * 实测约 1.1 秒/9MB，字牌表约 20ms/1MB（具体数字见
 * `docs/process/shanten-architecture-plan.md` §6）。
 */
export const getNumberSuitTable = (): SuitTable =>
  (numberSuitTableSingleton ??= buildSuitTable(NUMBER_SUIT_LENGTH, true));

export const getHonorSuitTable = (): SuitTable =>
  (honorSuitTableSingleton ??= buildSuitTable(HONOR_SUIT_LENGTH, false));

/** 每个花色 Δmelds 最多 4，4 个花色（m/p/s/z）求和的上限——真实 13/14 张
 * 手牌永远到不了这个上限（floor(14/3)=4），但 DP 状态空间本来就很小，留够
 * 余量不需要在这里做"真实达不到"的额外裁剪推理。 */
const MAX_TOTAL_MELDS = 16;
const DP_UNREACHED = -1;

let dpScratchA: Int16Array | undefined;
let dpScratchB: Int16Array | undefined;

const getDpScratch = (): [Int16Array, Int16Array] => {
  dpScratchA ??= new Int16Array((MAX_TOTAL_MELDS + 1) * 2);
  dpScratchB ??= new Int16Array((MAX_TOTAL_MELDS + 1) * 2);
  return [dpScratchA, dpScratchB];
};

/** 同 `vectorIndexOf`，但直接从一个更长的数组里取 `[start, start+length)`
 * 这一段编码，不用先 `slice` 出一份新数组。 */
const vectorIndexOfRange = (counts: readonly number[], start: number, length: number): number => {
  let index = 0;
  for (let i = length - 1; i >= 0; i -= 1) index = index * 5 + (counts[start + i] ?? 0);
  return index;
};

/**
 * Layer B：拆出 m/p/s/z 四个花色的计数向量分别查表，严格按 `tileSet.kinds`
 * 的物理顺序（m→p→s→z）跑一个 `(totalMelds, pairFlag)` 的小型 DP（复用两块
 * 模块级 scratch buffer 乒乓切换，不逐次调用分配新数组），最后对每个可达
 * 组合套用跟 `standardShantenByRecursion` 终态完全一样的公式取 min。
 *
 * 只应该在 `tileSet` 确实是 34 种、`m→p→s→z` 各 9/9/9/7 这个标准形状时调用
 * ——调用方（`shanten.ts` 的 `standardShanten`）只在
 * `tileSet === STANDARD_TILE_SET`（引用相等）时才应该走这条路径，非标准
 * `TileSet` 回退到 `standardShantenByRecursion`，这里不做形状校验。
 */
export const computeShantenViaTable = (
  tiles: readonly TileId[],
  tileSet: TileSet,
  existingMelds: number,
): number => {
  const counts = new Array<number>(tileSet.kinds.length).fill(0);
  for (const tile of tiles) {
    const index = tileSet.kindIndexOf(tileSet.kindOf(tile));
    counts[index] = (counts[index] ?? 0) + 1;
  }

  const numberTable = getNumberSuitTable();
  const honorTable = getHonorSuitTable();
  const blocks: readonly { start: number; table: SuitTable }[] = [
    { start: 0, table: numberTable },
    { start: NUMBER_SUIT_LENGTH, table: numberTable },
    { start: NUMBER_SUIT_LENGTH * 2, table: numberTable },
    { start: NUMBER_SUIT_LENGTH * 3, table: honorTable },
  ];

  let [dp, next] = getDpScratch();
  dp.fill(DP_UNREACHED);
  dp[0] = 0; // tm=0, pairFlag=0 -> 累计 tatsu=0

  for (const block of blocks) {
    const vectorIndex = vectorIndexOfRange(counts, block.start, block.table.suitLength);
    const base = vectorIndex * SLOTS_PER_VECTOR;
    const data = block.table.data;
    next.fill(DP_UNREACHED);
    for (let tm = 0; tm <= MAX_TOTAL_MELDS; tm += 1) {
      const fromNoPair = dp[tm * 2]!;
      const fromPair = dp[tm * 2 + 1]!;
      for (let dm = 0; dm <= MAX_DELTA_MELDS && tm + dm <= MAX_TOTAL_MELDS; dm += 1) {
        if (fromNoPair !== DP_UNREACHED) {
          const dtNoJiang = data[base + 5 + dm]!; // entryPair0ExitPair0：本花色不认雀头
          if (dtNoJiang >= 0) {
            const outIndex = (tm + dm) * 2;
            const candidate = fromNoPair + dtNoJiang;
            if (candidate > next[outIndex]!) next[outIndex] = candidate;
          }
          const dtJiang = data[base + 10 + dm]!; // entryPair0ExitPair1：本花色认雀头
          if (dtJiang >= 0) {
            const outIndex = (tm + dm) * 2 + 1;
            const candidate = fromNoPair + dtJiang;
            if (candidate > next[outIndex]!) next[outIndex] = candidate;
          }
        }
        if (fromPair !== DP_UNREACHED) {
          const dt = data[base + dm]!; // withEntryPair1：雀头已被更早花色认领
          if (dt >= 0) {
            const outIndex = (tm + dm) * 2 + 1;
            const candidate = fromPair + dt;
            if (candidate > next[outIndex]!) next[outIndex] = candidate;
          }
        }
      }
    }
    [dp, next] = [next, dp];
  }

  let best = Number.POSITIVE_INFINITY;
  for (let tm = 0; tm <= MAX_TOTAL_MELDS; tm += 1) {
    for (let pairFlag = 0; pairFlag <= 1; pairFlag += 1) {
      const totalTatsu = dp[tm * 2 + pairFlag]!;
      if (totalTatsu === DP_UNREACHED) continue;
      const totalMelds = existingMelds + tm;
      const usableTatsu = Math.min(totalTatsu, MAX_DELTA_MELDS - totalMelds);
      const shanten = 8 - totalMelds * 2 - usableTatsu - pairFlag;
      if (shanten < best) best = shanten;
    }
  }
  return best;
};
