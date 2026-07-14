import type { TileId, TileKind } from "./types.ts";

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
