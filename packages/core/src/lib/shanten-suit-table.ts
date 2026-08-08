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
 * 字牌表从约 20ms 降到约 15ms。
 *
 * 再往后一轮：`SuitTable` 从"稠密数组，`data[vectorIndex*15]` 直接寻址"
 * 改成两级存储（`indexMap: Int32Array` 做 `vectorIndex→紧凑下标`，紧凑
 * `data` 只存"至少有一个 vectorIndex 需要"的结果）。起因是 >14 剪枝 +
 * 镜像去重之后，稠密数组里 89.6% 都是从未写过的哨兵值——数牌表实测两级
 * 布局体积从 27.9MB 降到约 10.9MB（约 2.7x）。查表吞吐量交替对照测量下
 * 跟稠密布局基本打平（约 1.01x，噪声范围内；第一次未交替测量时误判为快
 * 22%，是 JIT 预热/顺序偏差，不是真实效应，交替测量后予以纠正）——两级
 * 布局的紧凑数组体积小，更容易被 CPU 缓存命中，抵消了多一次间接寻址的
 * 理论开销。`indexMap[vectorIndex]===-1`（从未建过）时下游 `base` 变负数，
 * 越界读 `data[base+...]` 返回 `undefined`，`computeShantenViaTable` 里的
 * `>= 0` 判断天然把它当"不可达"处理，查询路径不需要额外判空分支。
 *
 * 再往后一轮：发现两级布局里 `data` 记录之间的内容重复率也极高——实测
 * 数牌表 203,122 条紧凑记录只有 **1,119** 种不同内容（99.45% 是重复），
 * 字牌表 21,735 条只有 **47** 种（99.78%）。原因是 `Δmelds/Δtatsu` 的取值
 * 范围本身很窄，不同的计数向量大量收敛到同一套"能拼几副面子、剩几个
 * 搭子"的结果模式。`buildSuitTable` 因此在原有 >14 剪枝 + 镜像去重之上再
 * 加一层内容级 hash-cons：`contentKeyOf` 把一条 15 元素的 `Int8` 记录编码
 * 成一个 base-6 整数（每个值先 `+1` 映射到 `[0,5]`，`6^15≈4.7e11` 远小于
 * `Number.MAX_SAFE_INTEGER`，可以安全当 `Map<number, number>` 的 key，不用
 * 有 GC 开销的字符串 key）——内容第一次出现才追加进 `data`，重复内容直接
 * 复用已有下标。`data` 因此从约 2.91MB 压到约 17KB（数牌表）；连带效应是
 * `indexMap` 里存的下标上限从 203,122 骤降到 1,118，远小于 `Int16Array`
 * 上限，`indexMap` 也从 `Int32Array` 收窄成 `Int16Array`，从约 7.45MB 降到
 * 约 3.72MB。两处叠加，数牌表总大小从约 10.9MB 降到约 **3.74MB**（约
 * 2.9x），字牌表从约 638KB 降到约 150KB（约 4.25x）。内容去重给建表循环
 * 多加了一次 `Map` 查找/写入（数牌表约 20 万次、字牌表约 2 万次），交替
 * 对照测量下建表总耗时落在原有运行间噪声范围内，没有观测到显著变化——这
 * 部分开销相对 `solveSuitVector` 的递归计算量可以忽略。
 *
 * 再往后一轮（本轮，交替对照测量）：
 *   1. 查询热路径三项常数优化——`blocks` 数组/对象从每次查询新建改为模块级
 *      单例；`MAX_TOTAL_MELDS` 从宽松的 16 收紧到真实上界 4（论证见该常量
 *      注释）；查询用 counts 向量复用模块级 scratch。三项叠加单次查询实测
 *      从约 1.40µs 降到约 0.84µs（约 1.7x）。
 *   2. 寻址级镜像折叠——`indexMapSlotOfRange` 把「向量与其 rank 反转镜像」
 *      这一无序对折叠进同一个 `indexMap` 槽位（x/m/y 拆位 + 三角数编址，
 *      推导见该函数注释），`indexMap` 长度从 5^9 直址减半到 978,125 槽
 *      （约 3.72MB → 约 1.87MB，字牌表 153KB → 77KB），建表侧的镜像抄写
 *      随之消失；查询侧编址成本与原 base-5 编码同阶，吞吐实测反而略升
 *      （紧凑一半的 indexMap 更易驻留 CPU 缓存），与热路径三项叠加后单次
 *      查询约 0.79µs（相对本轮起点合计约 1.78x）。
 *   3. 建表 `data` 从按稠密上界一次性分配（数牌表约 29MB 瞬时峰值）改成
 *      小容量起步 + 倍增扩容，建表耗时不变。注：早前"峰值堆内存约 9MB"是
 *      当时布局下的测量，本轮之后建表瞬时峰值主要是 flat memo 的约 39MB
 *      （建完即可回收），`data` 不再贡献大块瞬时分配。
 *
 * 多线程建表（复用 `packages/ai/src/junk/tune-pool.ts` 的 worker_threads
 * 池模式）仍留作后续按需追加，目前的数字已经足够好，没有必要再加这层
 * 复杂度。
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

export const SLOTS_PER_VECTOR = 15;

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
   * 时下游 `base = -1 * SLOTS_PER_VECTOR` 是负数，读 `data[base+...]` 会越界
   * 返回 `undefined`，`computeShantenViaTable` 里的 `>= 0` 判断天然把
   * `undefined` 当"不可达"处理，不需要在查询路径里额外判空。 */
  indexMap: Int16Array;
  /** 紧凑数据：只存"至少有一个 vectorIndex 需要"的**不同内容**，数量远小于
   * `5^suitLength`，也远小于剪枝+镜像去重后的 vectorIndex 数量（数牌表实测
   * 仅 1,119 条，见 `buildSuitTable` 文档）。每份 15 个 Int8：
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
  for (let i = 0; i < SLOTS_PER_VECTOR; i += 1) key = key * 6 + (data[base + i]! + 1);
  return key;
};

/**
 * 全量建表：对 `[0, 5^suitLength)` 每个向量算出 withEntryPair1/
 * entryPair0ExitPair0/entryPair0ExitPair1 三组结果。m/p/s 传 `(9, true)`
 * 共用同一张表；z 传 `(7, false)`。
 *
 * 两级存储（`indexMap` + 紧凑 `data`），而不是直接 `data[vectorIndex*15]`
 * 稠密存储：数牌表实测两级布局体积从 27.9MB 降到约 10.9MB（约 2.7x），
 * 查表吞吐量交替对照测量下跟稠密布局基本打平（1.01x，噪声范围内）——稠密
 * 数组里 89.6% 都是从未写过的哨兵值（要么 >14 被剪，要么是镜像对里非代表
 * 的一侧），两级布局的紧凑数组更容易被 CPU 缓存命中，抵消了多一次间接寻址
 * 的开销。
 *
 * 三层去重（均已验证安全，见文件顶部注释）叠加决定了 `data` 的真实大小：
 * 1. 总张数 >14 的向量不计算——不可能是任何合法向量的必经之路，也不会被
 *    查询路径（真实手牌）用到，`indexMap` 里这类下标保持初始值 -1。
 * 2. rank 反转对称：只对 `vectorIndex <= mirrorVectorIndexOf(counts)` 的
 *    向量真正调用 `solveSuitVector`。
 * 3. 内容级 hash-cons：不同 vectorIndex 算出的 15 元素结果大量重复（数牌表
 *    实测 203,122 个 canonical 向量只有 1,119 种不同内容），用
 *    `contentKeyOf` 查 `contentMap`，内容第一次出现才追加进 `data`、分配
 *    新 contentId；重复内容直接复用已有 contentId，不重复存一份。
 *
 * `data` 从小容量起步、写满时倍增扩容（曾按 `vectorCount * SLOTS_PER_VECTOR`
 * 稠密上界一次性分配，数牌表约 29MB——内容去重后实际只需 ~17KB，白白抬高
 * 建表瞬时峰值内存），建完后按实际写入的 contentCount slice 成精确大小
 * （slice 是拷贝，不是 subarea 那种仍拴着原 buffer 的视图）。扩容拷贝总量
 * 与最终大小同阶（几十 KB），可忽略。每个候选内容先写进
 * `contentCount * SLOTS_PER_VECTOR` 这个尚未确认的槽位再算 key——如果判定
 * 是重复内容，contentCount 不递增，这个槽位会被下一次迭代的候选内容原地
 * 覆盖，不需要额外的 scratch buffer。
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

    const candidateBase = contentCount * SLOTS_PER_VECTOR;
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
  return { suitLength, hasRunLogic, indexMap, data: data.slice(0, contentCount * SLOTS_PER_VECTOR) };
};

let numberSuitTableSingleton: SuitTable | undefined;
let honorSuitTableSingleton: SuitTable | undefined;

/**
 * 进程内懒加载单例：第一次真正用到查表快路径（`computeShantenViaTable`）
 * 时才建表，之后同一进程内复用，不在模块 import 时建。原因：
 * `packages/core/vitest.config.ts` 没有关掉 test isolation，Vitest 4 默认
 * 每个测试文件独立 worker/模块注册表——若 import 时就建表，大量测试文件、
 * 以及不需要 shanten 的进程都会各自付一次建表成本。数牌表（m/p/s 共用）
 * 实测约 280ms、两级存储合计约 1.93MB（镜像折叠寻址的 `indexMap`
 * Int16Array 约 1.87MB + 内容去重后的紧凑 `data` 约 17KB），字牌表约
 * 20ms、约 78KB（具体数字见 `docs/process/shanten-architecture-plan.md`
 * §6）。
 */
export const getNumberSuitTable = (): SuitTable =>
  (numberSuitTableSingleton ??= buildSuitTable(NUMBER_SUIT_LENGTH, true));

export const getHonorSuitTable = (): SuitTable =>
  (honorSuitTableSingleton ??= buildSuitTable(HONOR_SUIT_LENGTH, false));

/** 合并 DP 里"手牌新拼出的面子总数"的上限。真实手牌 ≤14 张（见
 * `MAX_REAL_HAND_TILES`），floor(14/3)=4 副就是可达上限；且与建表侧丢弃
 * `Δmelds>4` 的论证同构——终态公式对更多面子只会更差，即使输入超界，丢弃
 * tm>4 的分支也不会丢掉任何最优解。收紧到 4（曾是宽松的 16）让 DP 内层
 * 迭代量降到约 1/3，对查询吞吐有实测收益（见文件顶部注释）。 */
const MAX_TOTAL_MELDS = 4;
const DP_UNREACHED = -1;

let dpScratchA: Int16Array | undefined;
let dpScratchB: Int16Array | undefined;

const getDpScratch = (): [Int16Array, Int16Array] => {
  dpScratchA ??= new Int16Array((MAX_TOTAL_MELDS + 1) * 2);
  dpScratchB ??= new Int16Array((MAX_TOTAL_MELDS + 1) * 2);
  return [dpScratchA, dpScratchB];
};

/** 花色遍历顺序（m/p/s 共表、z 单独）在进程内恒定，懒加载成模块级单例——
 * 曾经每次查询都重建这个数组 + 4 个对象字面量，是热路径上纯粹的 GC 压力。 */
type SuitBlock = { start: number; table: SuitTable };
let blocksSingleton: readonly SuitBlock[] | undefined;

const getBlocks = (): readonly SuitBlock[] => {
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
  const kindCount = tileSet.kinds.length;
  if (countsScratch === undefined || countsScratch.length !== kindCount)
    countsScratch = new Array<number>(kindCount);
  const counts = countsScratch;
  counts.fill(0);
  for (const tile of tiles) {
    const index = tileSet.kindIndexOf(tileSet.kindOf(tile));
    counts[index] = (counts[index] ?? 0) + 1;
  }

  const blocks = getBlocks();

  let [dp, next] = getDpScratch();
  dp.fill(DP_UNREACHED);
  dp[0] = 0; // tm=0, pairFlag=0 -> 累计 tatsu=0

  for (const block of blocks) {
    const slot = indexMapSlotOfRange(counts, block.start, block.table.suitLength);
    const contentId = block.table.indexMap[slot]!;
    const base = contentId * SLOTS_PER_VECTOR;
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
