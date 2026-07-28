/**
 * TileId -> tile-face image mapping, kept independent of @new-mj/core
 * (architecture iron law 6: web doesn't import core). This is safe because
 * the id-kind formula is a static, public mapping, not a rule
 * implementation — see engine-contract.md: "id→kind 映射静态公开，因此
 * TileId 与牌面同级敏感". Mirrors packages/core/src/lib/tiles.ts'
 * TILE_KINDS/STANDARD_TILE_SET (copiesPerKind = 4); junk is the only
 * ruleset this table serves for now.
 */
const TILE_KINDS = [
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
] as const;

type TileKind = (typeof TILE_KINDS)[number];
export type TileTheme = "Regular" | "Black";

const COPIES_PER_KIND = 4;

export const tileKindOf = (tileId: number): TileKind => {
  const kind = TILE_KINDS[Math.floor(tileId / COPIES_PER_KIND)];
  if (!kind) throw new Error(`INVALID_TILE_ID: ${tileId}`);
  return kind;
};

/** Sort a display copy by m → p → s → z while preserving physical TileIds. */
export const sortTilesForDisplay = (tileIds: readonly number[]): number[] =>
  tileIds
    .map((tileId, index) => ({
      tileId,
      index,
      kindIndex: TILE_KINDS.indexOf(tileKindOf(tileId)),
    }))
    .sort((left, right) => left.kindIndex - right.kindIndex || left.index - right.index)
    .map(({ tileId }) => tileId);

/** mj-next's public/tiles/Regular naming (Man/Pin/Sou + Ton/Nan/Shaa/Pei/Haku/Hatsu/Chun). */
const TILE_KIND_TO_FILE: Record<TileKind, string> = {
  "1m": "Man1",
  "2m": "Man2",
  "3m": "Man3",
  "4m": "Man4",
  "5m": "Man5",
  "6m": "Man6",
  "7m": "Man7",
  "8m": "Man8",
  "9m": "Man9",
  "1p": "Pin1",
  "2p": "Pin2",
  "3p": "Pin3",
  "4p": "Pin4",
  "5p": "Pin5",
  "6p": "Pin6",
  "7p": "Pin7",
  "8p": "Pin8",
  "9p": "Pin9",
  "1s": "Sou1",
  "2s": "Sou2",
  "3s": "Sou3",
  "4s": "Sou4",
  "5s": "Sou5",
  "6s": "Sou6",
  "7s": "Sou7",
  "8s": "Sou8",
  "9s": "Sou9",
  "1z": "Ton",
  "2z": "Nan",
  "3z": "Shaa",
  "4z": "Pei",
  "5z": "Haku",
  "6z": "Hatsu",
  "7z": "Chun",
};

export const tileImageSrc = (tileId: number, theme: TileTheme = "Regular"): string =>
  `/tiles/${theme}/${TILE_KIND_TO_FILE[tileKindOf(tileId)]}.svg`;

export const tileBackImageSrc = (theme: TileTheme = "Regular"): string =>
  `/tiles/${theme}/Back.svg`;
