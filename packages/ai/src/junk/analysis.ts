import {
  STANDARD_TILE_SET,
  evaluateUkeire,
  type Meld,
  type TileId,
  type UkeireEvaluation,
} from "@new-mj/core";

export type ShapeInput = Readonly<{ hand: readonly TileId[]; melds: readonly Meld[] }>;

export type JunkAnalysisCache = Readonly<{
  get: (key: string) => UkeireEvaluation | undefined;
  set: (key: string, value: UkeireEvaluation) => void;
  clear: () => void;
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}>;

/** Bounded structural-analysis LRU; it only caches concealed hand shape. */
export const createJunkAnalysisCache = (maxEntries = 32): JunkAnalysisCache => {
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0)
    throw new Error("maxEntries must be a positive safe integer");
  const entries = new Map<string, UkeireEvaluation>();
  let hits = 0;
  let misses = 0;
  return {
    get(key) {
      const value = entries.get(key);
      if (!value) {
        misses += 1;
        return undefined;
      }
      hits += 1;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    },
    clear() {
      entries.clear();
      hits = 0;
      misses = 0;
    },
    get hits() {
      return hits;
    },
    get misses() {
      return misses;
    },
    get size() {
      return entries.size;
    },
  };
};

export const tileCountsOf = (tiles: readonly TileId[]): Uint8Array => {
  const counts = new Uint8Array(STANDARD_TILE_SET.kinds.length);
  for (const tile of tiles) {
    counts[STANDARD_TILE_SET.kindIndexOf(STANDARD_TILE_SET.kindOf(tile))]! += 1;
  }
  return counts;
};

export const junkHandAnalysisKey = (input: ShapeInput): string =>
  `${input.melds.length}/${input.melds.length === 0 ? 1 : 0}/${tileCountsOf(input.hand).join("")}`;

export const analyzeJunkHand = (input: ShapeInput, cache?: JunkAnalysisCache): UkeireEvaluation => {
  if (!cache) {
    return evaluateUkeire(
      input.hand,
      { sevenPairs: input.melds.length === 0 },
      STANDARD_TILE_SET,
      input.melds.length,
    );
  }
  const key = junkHandAnalysisKey(input);
  const cached = cache.get(key);
  if (cached) return cached;
  const analysis = evaluateUkeire(
    input.hand,
    { sevenPairs: input.melds.length === 0 },
    STANDARD_TILE_SET,
    input.melds.length,
  );
  cache.set(key, analysis);
  return analysis;
};
