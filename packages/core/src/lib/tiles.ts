import type { TileId, TileKind } from "./ids.ts";

export const TILE_KINDS = [
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
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "1z",
  "2z",
  "3z",
  "4z",
  "5z",
  "6z",
  "7z",
] as const satisfies readonly TileKind[];

export type TileSet = Readonly<{
  kinds: readonly TileKind[];
  copiesPerKind: number;
  size: number;
  kindOf: (id: TileId) => TileKind;
}>;

// TileId 的排序是 kindIndex * copiesPerKind + copy；映射稳定且公开，因此
// 任何带 TileId 的 public 事件都等价于暴露牌面，必须遵守事件可见性契约。
export const createTileSet = (
  kinds: readonly TileKind[] = TILE_KINDS,
  copiesPerKind = 4,
): TileSet => {
  if (kinds.length === 0 || copiesPerKind < 1 || !Number.isInteger(copiesPerKind)) {
    throw new Error("INVALID_TILE_SET");
  }
  const knownKinds = new Set(kinds);
  if (knownKinds.size !== kinds.length) {
    throw new Error("DUPLICATE_TILE_KIND");
  }
  const size = kinds.length * copiesPerKind;
  return Object.freeze({
    kinds: Object.freeze([...kinds]),
    copiesPerKind,
    size,
    kindOf: (id: TileId): TileKind => {
      if (!Number.isInteger(id) || id < 0 || id >= size) {
        throw new Error("INVALID_TILE_ID");
      }
      return kinds[Math.floor(id / copiesPerKind)] as TileKind;
    },
  });
};

export const STANDARD_TILE_SET = createTileSet();

export const allTileIds = (tileSet: TileSet = STANDARD_TILE_SET): TileId[] =>
  Array.from({ length: tileSet.size }, (_, id) => id);

export const tileIdOf = (
  kind: TileKind,
  copy: number,
  tileSet: TileSet = STANDARD_TILE_SET,
): TileId => {
  const kindIndex = tileSet.kinds.indexOf(kind);
  if (kindIndex < 0 || !Number.isInteger(copy) || copy < 0 || copy >= tileSet.copiesPerKind) {
    throw new Error("INVALID_TILE_REFERENCE");
  }
  return kindIndex * tileSet.copiesPerKind + copy;
};

/**
 * Sort a display copy by `tileSet.kinds` order (m→p→s→z, then rank), stable
 * on ties — the canonical hand ordering PlayerView.hand/winSnapshot.hand are
 * returned in. Mirrors apps/web's independent `sortTilesForDisplay`
 * (duplicated there because web doesn't import core — see that file's own
 * doc); this is the source of truth other consumers (mobile, AI, tests) can
 * rely on without reimplementing it.
 */
export const sortTileIdsForDisplay = (
  tileIds: readonly TileId[],
  tileSet: TileSet = STANDARD_TILE_SET,
): TileId[] =>
  tileIds
    .map((tileId, index) => ({
      tileId,
      index,
      kindIndex: Math.floor(tileId / tileSet.copiesPerKind),
    }))
    .sort((left, right) => left.kindIndex - right.kindIndex || left.index - right.index)
    .map(({ tileId }) => tileId);

/**
 * Canonical display order for a winning hand's structural `groups` (see
 * engine-contract.md's HuDeclared doc): melds sorted ascending by their
 * first tile's kind, with the pair placed last. Each decompose algorithm
 * already yields group-internal order for free (a run is built
 * `[kind, kind+1, kind+2]`; a triplet/pair is the same kind repeated) — this
 * only reorders the groups relative to each other, never their own
 * contents. Seven pairs has no single pair to pull out (every group is
 * itself pair-shaped, or a merged deluxe quad — see hangzhou's
 * `decomposeSevenPairsWithWild`) — detected structurally by the absence of
 * any length-3 group, since standard-shape kongs live in `melds`, not
 * `groups`, so `groups` only ever contains a length-3 entry when a jiang is
 * also present.
 */
export const sortWinningGroupsForDisplay = (groups: readonly TileKind[][]): TileKind[][] => {
  const kindIndex = (group: readonly TileKind[]): number => TILE_KINDS.indexOf(group[0]!);
  const sorted = [...groups].sort((left, right) => kindIndex(left) - kindIndex(right));
  const hasJiang = sorted.some((group) => group.length === 3);
  if (!hasJiang) return sorted;
  const jiangIndex = sorted.findIndex((group) => group.length === 2);
  if (jiangIndex === -1) return sorted; // defensive; standard shape always has one
  const [jiang] = sorted.splice(jiangIndex, 1);
  return [...sorted, jiang!];
};
