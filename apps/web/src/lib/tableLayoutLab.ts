export const TABLE_LAYOUT_STORAGE_KEY = "new-mj:table-layout-lab:v1";

export type TableLayoutConfig = {
  version: 1;
  /** Hand tile sizing. Zone placement itself comes from the checked-in desktop.table-layout.json (see desktopTablePreset.ts), not from this config. */
  hand: {
    tileHeightPct: number;
  };
  /** Meld tile/column sizing within the Zone the board places it in. */
  meldInfo: {
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
  discard: { columns: number; rows: number };
  debug: { showRegions: boolean };
};

export const DEFAULT_TABLE_LAYOUT_CONFIG: TableLayoutConfig = {
  version: 1,
  hand: {
    tileHeightPct: 51,
  },
  meldInfo: {
    meldHeightPct: 94,
    meldTileHeightPct: 64,
  },
  tiles: {
    aspectRatio: 1.333,
    discardShortPct: 28,
    tileGapPx: 1.9,
  },
  discard: { columns: 8, rows: 3 },
  debug: { showRegions: false },
};

const limits = {
  handTileHeightPct: [5, 80],
  meldHeightPct: [10, 100],
  meldTileHeightPct: [5, 80],
  aspectRatio: [1.2, 1.8],
  discardShortPct: [5, 80],
  tileGapPx: [0, 8],
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
      tileHeightPct: numberAt(
        hand.tileHeightPct,
        defaults.hand.tileHeightPct,
        limits.handTileHeightPct,
      ),
    },
    meldInfo: {
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
