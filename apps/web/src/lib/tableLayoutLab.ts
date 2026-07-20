export const TABLE_LAYOUT_STORAGE_KEY = "new-mj:table-layout-lab:v1";

export type TableLayoutConfig = {
  version: 1;
  /** Outer ring: hand centered, with the drawn tile pinned to the right edge. Shared by the dev Layout Lab and the production Table board (see docs/process/table-ux-plan.md P4.1 收尾). */
  hand: {
    trackPct: number;
    /** Layout Lab only — how many synthetic hand tiles to preview, independent of `meldInfo.meldGroupCount`. Production always uses the real hand. */
    tileCount: number;
    tileHeightPct: number;
    /** Width % of the hand region reserved for each side column — an empty spacer on the left, the drawn tile (right-aligned) on the right. */
    sideWidthPct: number;
  };
  /** Middle ring, in the space the board used to reserve for the wall: Meld (left, bottom-aligned) + per-seat info (right). Shared by the dev Layout Lab and the production Table board. */
  meldInfo: {
    trackPct: number;
    /** Layout Lab only — number of synthetic 3-tile groups to preview; production renders however many real melds exist. */
    meldGroupCount: number;
    /** Width % of the Meld column; the info column takes the remainder. */
    meldWidthPct: number;
    /** Height % of the Meld column, bottom-aligned within it. */
    meldHeightPct: number;
    meldTileHeightPct: number;
  };
  /** Common tile-sizing knobs, plus the field still read by production's DiscardPile. */
  tiles: {
    aspectRatio: number;
    discardShortPct: number;
    tileGapPx: number;
  };
  discard: { trackPct: number; columns: number; rows: number };
  debug: { showRegions: boolean };
};

export const DEFAULT_TABLE_LAYOUT_CONFIG: TableLayoutConfig = {
  version: 1,
  hand: {
    trackPct: 12,
    tileCount: 13,
    tileHeightPct: 51,
    sideWidthPct: 12,
  },
  meldInfo: {
    trackPct: 10,
    meldGroupCount: 4,
    meldWidthPct: 80,
    meldHeightPct: 94,
    meldTileHeightPct: 64,
  },
  tiles: {
    aspectRatio: 1.333,
    discardShortPct: 28,
    tileGapPx: 1.9,
  },
  discard: { trackPct: 27, columns: 8, rows: 3 },
  debug: { showRegions: false },
};

const limits = {
  handTrackPct: [5, 30],
  handTileCount: [0, 13],
  handTileHeightPct: [5, 80],
  handSideWidthPct: [5, 30],
  meldInfoTrackPct: [5, 30],
  meldGroupCount: [0, 4],
  meldWidthPct: [10, 90],
  meldHeightPct: [10, 100],
  meldTileHeightPct: [5, 80],
  aspectRatio: [1.2, 1.8],
  discardShortPct: [5, 80],
  tileGapPx: [0, 8],
  trackPct: [5, 34],
  columns: [4, 14],
  rows: [2, 4],
} as const;

const numberAt = (value: unknown, fallback: number, [min, max]: readonly [number, number]) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
const booleanAt = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;
const recordAt = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function normalizeTableLayoutConfig(value: unknown): TableLayoutConfig {
  const root = recordAt(value);
  const hand = recordAt(root.hand);
  const meldInfo = recordAt(root.meldInfo);
  const tiles = recordAt(root.tiles);
  const discard = recordAt(root.discard);
  const debug = recordAt(root.debug);
  const defaults = DEFAULT_TABLE_LAYOUT_CONFIG;
  return {
    version: 1,
    hand: {
      trackPct: numberAt(hand.trackPct, defaults.hand.trackPct, limits.handTrackPct),
      tileCount: Math.round(
        numberAt(hand.tileCount, defaults.hand.tileCount, limits.handTileCount),
      ),
      tileHeightPct: numberAt(
        hand.tileHeightPct,
        defaults.hand.tileHeightPct,
        limits.handTileHeightPct,
      ),
      sideWidthPct: numberAt(
        hand.sideWidthPct,
        defaults.hand.sideWidthPct,
        limits.handSideWidthPct,
      ),
    },
    meldInfo: {
      trackPct: numberAt(meldInfo.trackPct, defaults.meldInfo.trackPct, limits.meldInfoTrackPct),
      meldGroupCount: Math.round(
        numberAt(meldInfo.meldGroupCount, defaults.meldInfo.meldGroupCount, limits.meldGroupCount),
      ),
      meldWidthPct: numberAt(
        meldInfo.meldWidthPct,
        defaults.meldInfo.meldWidthPct,
        limits.meldWidthPct,
      ),
      meldHeightPct: numberAt(
        meldInfo.meldHeightPct,
        defaults.meldInfo.meldHeightPct,
        limits.meldHeightPct,
      ),
      meldTileHeightPct: numberAt(
        meldInfo.meldTileHeightPct,
        defaults.meldInfo.meldTileHeightPct,
        limits.meldTileHeightPct,
      ),
    },
    tiles: {
      aspectRatio: numberAt(tiles.aspectRatio, defaults.tiles.aspectRatio, limits.aspectRatio),
      discardShortPct: numberAt(
        tiles.discardShortPct,
        defaults.tiles.discardShortPct,
        limits.discardShortPct,
      ),
      tileGapPx: numberAt(
        tiles.tileGapPx ?? tiles.tileGapPct,
        defaults.tiles.tileGapPx,
        limits.tileGapPx,
      ),
    },
    discard: {
      trackPct: numberAt(discard.trackPct, defaults.discard.trackPct, limits.trackPct),
      columns: Math.round(numberAt(discard.columns, defaults.discard.columns, limits.columns)),
      rows: Math.round(numberAt(discard.rows, defaults.discard.rows, limits.rows)),
    },
    debug: {
      showRegions: booleanAt(debug.showRegions, defaults.debug.showRegions),
    },
  };
}

export function readTableLayoutConfig(
  storage: Pick<Storage, "getItem"> = localStorage,
): TableLayoutConfig {
  try {
    const raw = storage.getItem(TABLE_LAYOUT_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_TABLE_LAYOUT_CONFIG);
    const parsed: unknown = JSON.parse(raw);
    if (recordAt(parsed).version !== 1) return structuredClone(DEFAULT_TABLE_LAYOUT_CONFIG);
    return normalizeTableLayoutConfig(parsed);
  } catch {
    return structuredClone(DEFAULT_TABLE_LAYOUT_CONFIG);
  }
}

export function writeTableLayoutConfig(
  config: TableLayoutConfig,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  storage.setItem(TABLE_LAYOUT_STORAGE_KEY, JSON.stringify(normalizeTableLayoutConfig(config)));
}
