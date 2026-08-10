/**
 * Layer 0：单花色预计算表（架构定位与长期取舍见 `docs/architecture/
 * shanten.md`）。把 shanten.ts 里 `standardShantenByRecursion` 的分支逻辑
 * 严格限制在单一花色（m/p/s 共用一张 9-rank 表，z 字牌单独一张 7-kind 表）
 * 内跑，输出「entryPair（进入该花色时全局雀头是否已被更早花色认领）
 * →(Δmelds,exitPair)→最大Δtatsu」，供文件末尾的 4 花色合并 DP
 * （`computeShantenViaTable`）查表使用。
 *
 * 正确性依赖三条不变量：
 *   1. 花色间从不交叉（顺子/搭子只在同花色内找，tileSet.kinds 按 m→p→s→z
 *      顺序串行处理），melds/tatsu 是纯累加计数器，只有 pair 跨花色耦合——
 *      所以单花色结果可以独立预计算，合并时只需要一个 pair bit 的小 DP。
 *   2. pair 一旦从 0 变成 1 就不会再变回 0，所以 entryPair=1 的结果里
 *      exitPair=0 恒不可达。
 *   3. 终态公式对 tatsu 单调不增：固定 Δmelds 时更多 Δtatsu 只会更好，
 *      每个 (Δmelds,exitPair) 只需存最大 Δtatsu，不需要帕累托前沿；
 *      Δmelds 只保留 0..4——继续往上加面子只会让终态公式变差，不会在任何
 *      合并结果里胜出，每一层递归都可以安全丢弃 Δmelds>4 的分支。
 *
 * 建表（`buildSuitTable`）只对必要的向量真正递归求解：总张数 >14 的向量
 * 对真实手牌不可达（`MAX_REAL_HAND_TILES`），rank 反转镜像对只算 canonical
 * 一侧（对称性论证见 `mirrorVectorIndexOf`）。递归用一整块扁平 `Int8Array`
 * 做 memo + `counts` 原地回溯——不要改回"逐 (counts,pair) 分配小数组"的
 * 写法，几百万个小对象的分配/GC 会把建表拖慢一个数量级以上。
 *
 * 存储是两级结构：`indexMap`（镜像折叠三角寻址，见 `indexMapSlotOfRange`）
 * → contentId → hash-cons 去重后的紧凑 `data`（`Δmelds/Δtatsu` 取值范围窄，
 * 不同向量的结果大量收敛到同一内容，见 `buildSuitTable`）。当前量级：
 * 数牌表建表约 280ms、合计约 1.9MB，字牌表约 20ms、约 78KB，单次整手查询
 * 约 0.8µs；表是进程内懒加载单例（原因见 `getNumberSuitTable`）。
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
 * 不实际反转 counts 数组，直接算出"rank 反转后那个向量"的下标（等价于
 * `vectorIndexOf(counts.slice().reverse())`），用于 `buildSuitTable` 的
 * canonical 判断。对称性论证：所有分支（刻子/顺子/搭子/雀头）都只看"是不是
 * 同一 rank"或"差 1/2 个 rank"，反转 rank 顺序（1↔9、2↔8…）不改变这些
 * 条件，所以镜像向量的求解结果逐位相同——只需算一半。字牌（无顺子/相邻
 * 搭子分支）同样成立。
 */
const mirrorVectorIndexOf = (counts: readonly number[]): number => {
  let index = 0;
  for (let i = 0; i < counts.length; i += 1) index = index * 5 + (counts[i] ?? 0);
  return index;
};

/**
 * counts（或更长数组里 `[start, start+suitLength)` 一段）→ `indexMap` 槽位。
 * 这是查询路径与测试访问 `indexMap` 的唯一入口——寻址方案如果再改变，只改
 * 这里、`indexMapLengthOf` 与 `buildSuitTable` 的写入侧即可。
 *
 * 当前方案把 rank 反转镜像对称直接编码进寻址（一个镜像对共享一个槽位，
 * `indexMap` 长度约减半）：把数位拆成三段——低位 `half` 个数位按
 * `counts[start]` 为最高位编成 `y`，高位 `half` 个数位按 `counts[start+
 * suitLength-1]` 为最高位编成 `x`，正中数位为 `m`（假设 suitLength 为奇数，
 * 9/7 都满足）。`vectorIndexOf` 下 `counts[suitLength-1]` 是最高位，逐位比较
 * 可得 `v ≤ mirror(v) ⟺ x ≤ y`（x=y 恰为回文）；镜像操作恰好交换 x/y、
 * 保持 m，所以对 `{x,y}` 做 min/max 规范化后按三角数编址
 * `t = hi*(hi+1)/2 + lo`，镜像对必然落到同一槽位，不同对必不相撞（单射性
 * 与镜像内容一致性均有穷举测试兜底）。
 */
export const indexMapSlotOfRange = (
  counts: readonly number[],
  start: number,
  suitLength: number,
): number => {
  const half = (suitLength - 1) >> 1;
  let x = 0;
  let y = 0;
  for (let i = 0; i < half; i += 1) {
    y = y * 5 + (counts[start + i] ?? 0);
    x = x * 5 + (counts[start + suitLength - 1 - i] ?? 0);
  }
  const m = counts[start + half] ?? 0;
  const lo = x < y ? x : y;
  const hi = x < y ? y : x;
  return (((hi * (hi + 1)) >> 1) + lo) * 5 + m;
};

export const indexMapSlotOf = (counts: readonly number[]): number =>
  indexMapSlotOfRange(counts, 0, counts.length);

/** `indexMapSlotOfRange` 值域大小 = 无序对 `{x,y}` 数（`P=5^half` 时
 * `P*(P+1)/2`）× 中位 5 种取值。9 位数牌表 978,125（直址的 50.08%，多出的
 * 0.08% 是回文向量，它们没有配对可省），7 位字牌表 39,375。 */
export const indexMapLengthOf = (suitLength: number): number => {
  const halfCount = 5 ** ((suitLength - 1) >> 1);
  return ((halfCount * (halfCount + 1)) / 2) * 5;
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

/** 每条转移记录有 15 个有效槽位，物理步长补齐到 16，令热路径的 contentId
 * 寻址可以使用左移。第 16 个槽位只是 padding，不参与内容 key 或转移语义。 */
const CONTENT_SLOTS_PER_VECTOR = 15;
export const SLOTS_PER_VECTOR = 16;

export type SuitTable = {
  suitLength: number;
  hasRunLogic: boolean;
  /** `indexMapSlotOfRange(counts)` 槽位 → `data` 里的第几份（不是字节偏移，
   * 乘 `SLOTS_PER_VECTOR` 才是）。长度为 `indexMapLengthOf(suitLength)`——
   * 寻址把镜像对折叠进同一槽位，约为 vectorIndex 直址的一半。槽位值是内容
   * 去重后的 contentId：很多向量算出的 15 元素结果内容完全一样（见
   * `buildSuitTable` 文档），会共享同一个 contentId，所以上限远小于向量数
   * （数牌表实测上限仅 1,118），`Int16Array` 足够存下。-1 表示这个槽位从未
   * 建过（总张数 >14，被剪掉；真实手牌的查询路径不会用到）——`contentId=-1`
   * 时下游 `base = -1 << 4` 是负数，读 `data[base+...]` 会越界
   * 返回 `undefined`，`computeShantenViaTable` 里的 `>= 0` 判断天然把
   * `undefined` 当"不可达"处理，不需要在查询路径里额外判空。 */
  indexMap: Int16Array;
  /** 紧凑数据：只存"至少有一个 vectorIndex 需要"的**不同内容**，数量远小于
   * `5^suitLength`，也远小于剪枝+镜像去重后的 vectorIndex 数量（数牌表实测
   * 仅 1,119 条，见 `buildSuitTable` 文档）。每份物理步长 16 个 Int8：
   * `[0..4]`=withEntryPair1，`[5..9]`=entryPair0ExitPair0，
   * `[10..14]`=entryPair0ExitPair1。 */
  data: Int8Array;
};

/** 一整手牌（不管副露）最多 14 张——单个花色的向量若总张数超过这个数，
 * 不可能是任何真实手牌里"这个花色那部分"的样子（见 `buildSuitTable` 里的
 * 剪枝）。导出给测试用，确保测试断言的边界和实现用的是同一个数。 */
export const MAX_REAL_HAND_TILES = 14;

/**
 * 把 `data` 里从 `base` 开始的一条 15 元素记录编码成一个 base-6 整数，
 * 用作 `buildSuitTable` 内容去重 `Map` 的 key：每个值先 `+1`（原始取值范围
 * 是 `[SENTINEL, MAX_DELTA_MELDS] = [-1,4]`，共 6 种）映射到 `[0,5]`，再按
 * base-6 累乘。`6^15 ≈ 4.7e11`，远小于 `Number.MAX_SAFE_INTEGER`（约 9e15），
 * 可以安全当 JS number 用、直接做 `Map<number, number>` 的 key——比拼字符串
 * key 省掉了字符串分配/GC 开销。
 */
const contentKeyOf = (data: Int8Array, base: number): number => {
  let key = 0;
  for (let i = 0; i < CONTENT_SLOTS_PER_VECTOR; i += 1) key = key * 6 + (data[base + i]! + 1);
  return key;
};

/**
 * 全量建表：对 `[0, 5^suitLength)` 每个向量算出 withEntryPair1/
 * entryPair0ExitPair0/entryPair0ExitPair1 三组结果。m/p/s 传 `(9, true)`
 * 共用同一张表；z 传 `(7, false)`。
 *
 * 三层裁剪叠加决定了表的真实大小（安全性论证见文件顶部与各函数注释）：
 * 1. 总张数 >14 的向量不计算——任何分支都是从 counts 里减牌再递归，子状态
 *    总张数只减不增，>14 的向量不可能是任何合法向量的必经之路，也不会被
 *    真实手牌的查询路径用到，对应槽位保持初始值 -1。
 * 2. rank 反转镜像对只对 canonical 一侧真正调用 `solveSuitVector`——寻址
 *    本身把镜像对折叠进同一槽位（`indexMapSlotOfRange`），另一侧无需写入。
 * 3. 内容级 hash-cons：不同向量算出的 15 元素结果大量重复（数牌表约 20 万
 *    个 canonical 向量只有 1,119 种不同内容），用 `contentKeyOf` 查
 *    `contentMap`，内容第一次出现才追加进 `data`、分配新 contentId；重复
 *    内容直接复用已有 contentId。
 *
 * `data` 小容量起步、写满时倍增扩容（内容去重后最终只有几十 KB，不值得按
 * 稠密上界预分配），建完后 slice 成精确大小（slice 是拷贝，不是 subarray
 * 那种仍拴着原 buffer 的视图）。每个候选内容先写进
 * `contentCount << 4` 这个尚未确认的槽位再算 key——如果判定
 * 是重复内容，contentCount 不递增，槽位被下一次迭代的候选内容原地覆盖，
 * 不需要额外的 scratch buffer。
 */
export const buildSuitTable = (suitLength: number, hasRunLogic: boolean): SuitTable => {
  const vectorCount = 5 ** suitLength;
  const flat = new Int8Array(vectorCount * 2 * 10).fill(UNSET);
  const indexMap = new Int16Array(indexMapLengthOf(suitLength)).fill(-1);
  let data = new Int8Array(64 * SLOTS_PER_VECTOR);
  const contentMap = new Map<number, number>();
  const counts = new Array<number>(suitLength).fill(0);
  let contentCount = 0;
  for (let vectorIndex = 0; vectorIndex < vectorCount; vectorIndex += 1) {
    let remaining = vectorIndex;
    let total = 0;
    for (let i = 0; i < suitLength; i += 1) {
      counts[i] = remaining % 5;
      total += counts[i]!;
      remaining = Math.floor(remaining / 5);
    }
    if (total > MAX_REAL_HAND_TILES) continue;

    // 镜像那侧已经算过并写进了共享槽位（寻址本身对镜像对称），这里直接跳过。
    if (mirrorVectorIndexOf(counts) < vectorIndex) continue;

    const base0 = solveSuitVector(flat, counts, 0, hasRunLogic);
    const base1 = solveSuitVector(flat, counts, 1, hasRunLogic);

    const candidateBase = contentCount << 4;
    if (candidateBase + SLOTS_PER_VECTOR > data.length) {
      const grown = new Int8Array(data.length * 2);
      grown.set(data);
      data = grown;
    }
    for (let dm = 0; dm <= MAX_DELTA_MELDS; dm += 1) {
      data[candidateBase + dm] = flat[base1 + 5 + dm]!; // withEntryPair1
      data[candidateBase + 5 + dm] = flat[base0 + dm]!; // entryPair0ExitPair0
      data[candidateBase + 10 + dm] = flat[base0 + 5 + dm]!; // entryPair0ExitPair1
    }

    const key = contentKeyOf(data, candidateBase);
    let contentId = contentMap.get(key);
    if (contentId === undefined) {
      contentId = contentCount;
      contentMap.set(key, contentId);
      contentCount += 1;
    }

    indexMap[indexMapSlotOf(counts)] = contentId;
  }
  return {
    suitLength,
    hasRunLogic,
    indexMap,
    data: data.slice(0, contentCount << 4),
  };
};

let numberSuitTableSingleton: SuitTable | undefined;
let honorSuitTableSingleton: SuitTable | undefined;

/**
 * 进程内懒加载单例：第一次真正用到查表快路径（`computeShantenViaTable`）
 * 时才建表，之后同一进程内复用，不在模块 import 时建。原因：
 * `packages/core/vitest.config.ts` 没有关掉 test isolation，Vitest 4 默认
 * 每个测试文件独立 worker/模块注册表——若 import 时就建表，大量用不到
 * shanten 的测试文件与进程都会各自付一次建表成本。
 */
export const getNumberSuitTable = (): SuitTable =>
  (numberSuitTableSingleton ??= buildSuitTable(NUMBER_SUIT_LENGTH, true));

export const getHonorSuitTable = (): SuitTable =>
  (honorSuitTableSingleton ??= buildSuitTable(HONOR_SUIT_LENGTH, false));

/** 合并 DP 里"手牌新拼出的面子总数"的上限。真实手牌 ≤14 张（见
 * `MAX_REAL_HAND_TILES`），floor(14/3)=4 副就是可达上限；且与建表侧丢弃
 * `Δmelds>4` 的论证同构——终态公式对更多面子只会更差，即使输入超界，丢弃
 * tm>4 的分支也不会丢掉任何最优解。 */
const MAX_TOTAL_MELDS = 4;
const DP_UNREACHED = -1;

let dpScratchA: Int16Array | undefined;
let dpScratchB: Int16Array | undefined;

const getDpScratch = (): [Int16Array, Int16Array] => {
  dpScratchA ??= new Int16Array((MAX_TOTAL_MELDS + 1) * 2);
  dpScratchB ??= new Int16Array((MAX_TOTAL_MELDS + 1) * 2);
  return [dpScratchA, dpScratchB];
};

/** 花色遍历顺序（m/p/s 共表、z 单独）在进程内恒定，懒加载成模块级单例，
 * 避免热路径上每次查询分配数组 + 4 个对象字面量的纯 GC 开销。 */
export type SuitBlock = { start: number; table: SuitTable };
let blocksSingleton: readonly SuitBlock[] | undefined;

export const getBlocks = (): readonly SuitBlock[] => {
  if (blocksSingleton === undefined) {
    const numberTable = getNumberSuitTable();
    blocksSingleton = [
      { start: 0, table: numberTable },
      { start: NUMBER_SUIT_LENGTH, table: numberTable },
      { start: NUMBER_SUIT_LENGTH * 2, table: numberTable },
      { start: NUMBER_SUIT_LENGTH * 3, table: getHonorSuitTable() },
    ];
  }
  return blocksSingleton;
};

/** 查询用的 34 长度计数向量 scratch，同 `dpScratch` 的复用模式；core 是
 * 同步单线程纯计算，调用之间不保留引用，复用安全。 */
let countsScratch: number[] | undefined;

/**
 * 把一条转移记录的 15 个有效槽位（表里的单花色结果，或 `composeTransitions` 合成
 * 的多花色转移）应用到 DP 状态上：`dp`（`(tm*2+pairFlag)` → 累计最大
 * tatsu，`DP_UNREACHED`=不可达）经 `rec[base..base+14]` 转移写进 `next`。
 * `base` 为负（花色总张数 >14 被剪，真实手牌不会出现）时越界读返回
 * `undefined`，`>= 0` 判断把它当不可达处理，无需判空。
 */
export const applyTransition = (
  dp: Int16Array,
  next: Int16Array,
  rec: Int8Array,
  base: number,
): void => {
  next.fill(DP_UNREACHED);
  for (let tm = 0; tm <= MAX_TOTAL_MELDS; tm += 1) {
    const fromNoPair = dp[tm * 2]!;
    const fromPair = dp[tm * 2 + 1]!;
    for (let dm = 0; dm <= MAX_DELTA_MELDS && tm + dm <= MAX_TOTAL_MELDS; dm += 1) {
      if (fromNoPair !== DP_UNREACHED) {
        const dtNoJiang = rec[base + 5 + dm]!; // entryPair0ExitPair0：不认雀头
        if (dtNoJiang >= 0) {
          const outIndex = (tm + dm) * 2;
          const candidate = fromNoPair + dtNoJiang;
          if (candidate > next[outIndex]!) next[outIndex] = candidate;
        }
        const dtJiang = rec[base + 10 + dm]!; // entryPair0ExitPair1：认雀头
        if (dtJiang >= 0) {
          const outIndex = (tm + dm) * 2 + 1;
          const candidate = fromNoPair + dtJiang;
          if (candidate > next[outIndex]!) next[outIndex] = candidate;
        }
      }
      if (fromPair !== DP_UNREACHED) {
        const dt = rec[base + dm]!; // withEntryPair1：雀头已被更早花色认领
        if (dt >= 0) {
          const outIndex = (tm + dm) * 2 + 1;
          const candidate = fromPair + dt;
          if (candidate > next[outIndex]!) next[outIndex] = candidate;
        }
      }
    }
  }
};

/** 对每个可达 (tm,pairFlag) 套用跟 `standardShantenByRecursion` 终态完全
 * 一样的公式取 min。 */
export const finalizeDp = (dp: Int16Array, existingMelds: number): number => {
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

/**
 * Layer B 的 DP 核心：直接接受调用方已经数好的 34 长度计数向量（m→p→s→z
 * 标准顺序），拆出四个花色分别查表，按物理顺序跑 `(totalMelds, pairFlag)`
 * 的小型 DP（复用两块模块级 scratch buffer 乒乓切换），最后套终态公式取
 * min。`counts` 只读不改。
 *
 * 单独导出是给"同一手牌反复试探 ±1 张"的调用方（如 `ukeire`）用的：建一次
 * counts、试探时原地 ±1 再调这里，避免每个候选都重建数组/反查牌种；批量
 * 试探还有更省的 `createShantenProber`。
 */
export const computeShantenFromCounts = (
  counts: readonly number[],
  existingMelds: number,
): number => {
  const blocks = getBlocks();
  let [dp, next] = getDpScratch();
  dp.fill(DP_UNREACHED);
  dp[0] = 0; // tm=0, pairFlag=0 -> 累计 tatsu=0
  for (const block of blocks) {
    const slot = indexMapSlotOfRange(counts, block.start, block.table.suitLength);
    const base = block.table.indexMap[slot]! << 4;
    applyTransition(dp, next, block.table.data, base);
    [dp, next] = [next, dp];
  }
  return finalizeDp(dp, existingMelds);
};

/**
 * 从 TileId 数组入口的包装：数出 counts（复用模块级 scratch）后走
 * `computeShantenFromCounts`。只应该在 `tileSet` 确实是 34 种、`m→p→s→z`
 * 各 9/9/9/7 这个标准形状时调用——调用方（`shanten.ts` 的 `standardShanten`）
 * 只在 `tileSet === STANDARD_TILE_SET`（引用相等）时才应该走这条路径，
 * 非标准 `TileSet` 回退到 `standardShantenByRecursion`，这里不做形状校验。
 */
export const computeShantenViaTable = (
  tiles: readonly TileId[],
  tileSet: TileSet,
  existingMelds: number,
): number => {
  const kindCount = tileSet.kinds.length;
  if (countsScratch === undefined || countsScratch.length !== kindCount)
    countsScratch = new Array<number>(kindCount);
  const counts = countsScratch;
  counts.fill(0);
  for (const tile of tiles) {
    const index = tileSet.kindIndexOf(tileSet.kindOf(tile));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return computeShantenFromCounts(counts, existingMelds);
};

/**
 * 把两条各含 15 个有效槽位的转移记录（`a` 先、`b` 后）合成一条等价记录，写进
 * `out`。转移在 (Δmelds, pair) 上构成 max-plus 半环，天然可结合：
 *   - withEntryPair1 链：两段都在"雀头已认领"轨道上。
 *   - entryPair0ExitPair0 链：两段都不认雀头。
 *   - entryPair0ExitPair1：雀头在 `a` 段认领（之后 `b` 走 withEntryPair1），
 *     或 `a` 段不认、`b` 段认领——取两者较大。
 * Δmelds 超过 4 的组合照旧丢弃（与不变量 3 同构）。`aBase` 允许指向表
 * `data` 里的一条记录；越界（负 base）读 `undefined` 时 `>= 0` 判断天然
 * 跳过，语义与 `applyTransition` 一致。
 */
export const composeTransitions = (
  a: Int8Array,
  aBase: number,
  b: Int8Array,
  bBase: number,
  out: Int8Array,
): void => {
  out.fill(SENTINEL);
  for (let dm1 = 0; dm1 <= MAX_DELTA_MELDS; dm1 += 1) {
    for (let dm2 = 0; dm1 + dm2 <= MAX_DELTA_MELDS; dm2 += 1) {
      const dm = dm1 + dm2;
      const aPair1 = a[aBase + dm1]!;
      const bPair1 = b[bBase + dm2]!;
      if (aPair1 >= 0 && bPair1 >= 0 && aPair1 + bPair1 > out[dm]!) out[dm] = aPair1 + bPair1;
      const a00 = a[aBase + 5 + dm1]!;
      const b00 = b[bBase + 5 + dm2]!;
      if (a00 >= 0 && b00 >= 0 && a00 + b00 > out[5 + dm]!) out[5 + dm] = a00 + b00;
      const b01 = b[bBase + 10 + dm2]!;
      if (a00 >= 0 && b01 >= 0 && a00 + b01 > out[10 + dm]!) out[10 + dm] = a00 + b01;
      const a01 = a[aBase + 10 + dm1]!;
      if (a01 >= 0 && bPair1 >= 0 && a01 + bPair1 > out[10 + dm]!) out[10 + dm] = a01 + bPair1;
    }
  }
};
