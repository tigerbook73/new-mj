import {
  applyTransition,
  composeTransitions,
  finalizeDp,
  getBlocks,
  indexMapSlotOfRange,
  NUMBER_SUIT_LENGTH,
  SLOTS_PER_VECTOR,
  type SuitBlock,
} from "./shanten-suit-table.ts";

const DP_UNREACHED = -1;
const SENTINEL = -1;

/** 恒等转移：Δmelds=0、Δtatsu=0、pair 状态原样穿过。 */
const IDENTITY_TRANSITION = (() => {
  const identity = new Int8Array(SLOTS_PER_VECTOR).fill(SENTINEL);
  identity[0] = 0; // withEntryPair1
  identity[5] = 0; // entryPair0ExitPair0
  return identity;
})();

/**
 * 批量试探器：对固定手牌预计算每个花色 block 前的 DP 前缀状态与其后所有
 * block 合成的后缀转移，之后 `probe(kindIndex)` 与"`counts[kindIndex]+1`
 * 后调 `computeShantenFromCounts`"逐位等价，但每次只需重查改动花色的一条
 * 记录 + 两次转移应用（前缀状态 ⊗ 改动花色 ⊗ 后缀转移），不用重跑全部
 * 4 个 block。`ukeire` 对同一手牌试探 30 余种进张时用。
 *
 * `countsSource` 在构造时拷贝，构造后调用方的修改不影响试探结果；返回的
 * probe 闭包持有自己的 scratch，不与 `computeShantenFromCounts` 共享，
 * 两者可交错调用。
 */
export const createShantenProber = (
  countsSource: readonly number[],
  existingMelds: number,
): ((kindIndex: number) => number) => {
  const blocks = getBlocks();
  const counts = [...countsSource];
  const prefix: Int16Array[] = [];
  let state = new Int16Array(10).fill(DP_UNREACHED);
  state[0] = 0;
  for (const block of blocks) {
    prefix.push(state);
    const slot = indexMapSlotOfRange(counts, block.start, block.table.suitLength);
    const base = block.table.indexMap[slot]! << 4;
    const next = new Int16Array(10);
    applyTransition(state, next, block.table.data, base);
    state = next;
  }
  const suffix: Int8Array[] = new Array<Int8Array>(blocks.length + 1);
  suffix[blocks.length] = IDENTITY_TRANSITION;
  for (let i = blocks.length - 1; i >= 1; i -= 1) {
    const block = blocks[i]!;
    const slot = indexMapSlotOfRange(counts, block.start, block.table.suitLength);
    const base = block.table.indexMap[slot]! << 4;
    const out = new Int8Array(SLOTS_PER_VECTOR);
    composeTransitions(block.table.data, base, suffix[i + 1]!, 0, out);
    suffix[i] = out;
  }
  const mid = new Int16Array(10);
  const fin = new Int16Array(10);
  return (kindIndex: number): number => {
    const blockIndex =
      kindIndex < NUMBER_SUIT_LENGTH * 3 ? Math.floor(kindIndex / NUMBER_SUIT_LENGTH) : 3;
    const block = blocks[blockIndex]!;
    counts[kindIndex] = (counts[kindIndex] ?? 0) + 1;
    const slot = indexMapSlotOfRange(counts, block.start, block.table.suitLength);
    counts[kindIndex] = (counts[kindIndex] ?? 0) - 1;
    const base = block.table.indexMap[slot]! << 4;
    applyTransition(prefix[blockIndex]!, mid, block.table.data, base);
    applyTransition(mid, fin, suffix[blockIndex + 1]!, 0);
    return finalizeDp(fin, existingMelds);
  };
};

/**
 * 在同一组基础计数上批量试探“先删一张、再加一张”。两次修改最多影响两个
 * 花色，因此复用基础手牌的 prefix/suffix；调用方不需要为每个删牌结果重新
 * 建一套四花色 prober。用于 2-ply 的叶子进张评估。
 */
export const createTwoChangeShantenProber = (
  countsSource: readonly number[],
  existingMelds: number,
): ((removeKindIndex: number, addKindIndex?: number) => number) => {
  const blocks = getBlocks();
  const baseCounts = [...countsSource];
  const baseBases: number[] = [];
  const basePrefix: Int16Array[] = [];
  let state = new Int16Array(10).fill(DP_UNREACHED);
  state[0] = 0;
  for (const block of blocks) {
    basePrefix.push(state);
    const slot = indexMapSlotOfRange(baseCounts, block.start, block.table.suitLength);
    const base = block.table.indexMap[slot]! << 4;
    baseBases.push(base);
    const next = new Int16Array(10);
    applyTransition(state, next, block.table.data, base);
    state = next;
  }
  const baseSuffix: Int8Array[] = new Array<Int8Array>(blocks.length + 1);
  baseSuffix[blocks.length] = IDENTITY_TRANSITION;
  // suffix[0] is never queried: every add/remove path starts at block + 1.
  for (let i = blocks.length - 1; i >= 1; i -= 1) {
    const block = blocks[i]!;
    const slot = indexMapSlotOfRange(baseCounts, block.start, block.table.suitLength);
    const base = block.table.indexMap[slot]! << 4;
    const out = new Int8Array(SLOTS_PER_VECTOR);
    composeTransitions(block.table.data, base, baseSuffix[i + 1]!, 0, out);
    baseSuffix[i] = out;
  }
  const blockOf = (kindIndex: number): number =>
    kindIndex < NUMBER_SUIT_LENGTH * 3 ? Math.floor(kindIndex / NUMBER_SUIT_LENGTH) : 3;
  type RemoveContext = Readonly<{
    counts: number[];
    prefix: Int16Array[];
    tail: Int8Array[];
    result: number;
  }>;
  const contexts = new Map<number, RemoveContext>();
  const makeRemoveContext = (removeKindIndex: number): RemoveContext => {
    const cached = contexts.get(removeKindIndex);
    if (cached) return cached;
    const counts = [...baseCounts];
    counts[removeKindIndex] = (counts[removeKindIndex] ?? 0) - 1;
    const prefix: Int16Array[] = [];
    const removeBlock = blockOf(removeKindIndex);
    // Removing a tile only changes its own suit block. Reuse the immutable base
    // prefix before that block; only the changed block and its suffix need to be
    // replayed for this remove context.
    let state = basePrefix[removeBlock]!;
    for (let blockIndex = 0; blockIndex < removeBlock; blockIndex += 1) {
      prefix.push(basePrefix[blockIndex]!);
    }
    for (let blockIndex = removeBlock; blockIndex < blocks.length; blockIndex += 1) {
      prefix.push(state);
      const block = blocks[blockIndex]!;
      const slot = indexMapSlotOfRange(counts, block.start, block.table.suitLength);
      const base = block.table.indexMap[slot]! << 4;
      const next = new Int16Array(10);
      applyTransition(state, next, block.table.data, base);
      state = next;
    }
    const tail = new Array<Int8Array>(blocks.length);
    for (let addBlock = removeBlock; addBlock < blocks.length; addBlock += 1)
      tail[addBlock] = baseSuffix[addBlock + 1]!;

    // 更早 add 花色的 tail 互相嵌套：每一层只需把右侧已构造的 tail 前面再接上
    // 一个未改变的花色块。由右向左构造一次，避免为每个 add 花色重复合成同一段
    // remove-to-end 后缀。
    if (removeBlock > 0) {
      const removeTable = blocks[removeBlock]!;
      const removeSlot = indexMapSlotOfRange(
        counts,
        removeTable.start,
        removeTable.table.suitLength,
      );
      const removeBase = removeTable.table.indexMap[removeSlot]! << 4;
      const afterRemove = new Int8Array(SLOTS_PER_VECTOR);
      composeTransitions(
        removeTable.table.data,
        removeBase,
        baseSuffix[removeBlock + 1]!,
        0,
        afterRemove,
      );
      let transition = afterRemove;
      tail[removeBlock - 1] = transition;
      for (let addBlock = removeBlock - 2; addBlock >= 0; addBlock -= 1) {
        const blockIndex = addBlock + 1;
        const block = blocks[blockIndex]!;
        const out = new Int8Array(SLOTS_PER_VECTOR);
        composeTransitions(block.table.data, baseBases[blockIndex]!, transition, 0, out);
        transition = out;
        tail[addBlock] = transition;
      }
    }
    const result = finalizeDp(state, existingMelds);
    const context = { counts, prefix, tail, result };
    contexts.set(removeKindIndex, context);
    return context;
  };
  const first = new Int16Array(10);
  const second = new Int16Array(10);
  const finish = (dp: Int16Array): number => finalizeDp(dp, existingMelds);
  return (removeKindIndex: number, addKindIndex?: number): number => {
    const context = makeRemoveContext(removeKindIndex);
    if (addKindIndex === undefined) return context.result;
    if (addKindIndex === removeKindIndex) return finish(state);
    const removeBlock = blockOf(removeKindIndex);
    const addBlock = blockOf(addKindIndex);
    const counts = context.counts;
    counts[addKindIndex] = (counts[addKindIndex] ?? 0) + 1;
    const block = blocks[addBlock]!;
    const slot = indexMapSlotOfRange(counts, block.start, block.table.suitLength);
    const base = block.table.indexMap[slot]! << 4;
    if (addBlock >= removeBlock) {
      applyTransition(context.prefix[addBlock]!, first, block.table.data, base);
      applyTransition(first, second, baseSuffix[addBlock + 1]!, 0);
      counts[addKindIndex] = (counts[addKindIndex] ?? 0) - 1;
      return finish(second);
    }
    applyTransition(basePrefix[addBlock]!, first, block.table.data, base);
    applyTransition(first, second, context.tail[addBlock]!, 0);
    counts[addKindIndex] = (counts[addKindIndex] ?? 0) - 1;
    return finish(second);
  };
};
