/**
 * Table presentation parameters: content-level sizing knobs for what goes
 * inside each Zone (see layoutPreset.ts for the geometry itself). Kept as a
 * plain type — no runtime parsing/clamping — because the only producer is a
 * hand-authored, type-checked TS constant (see layouts/desktop.table-config.ts),
 * not JSON or localStorage. If the Table Layout Lab ever needs to edit this
 * data, reintroduce validation for whatever untyped input path that adds.
 */
export type TableLayoutConfig = {
  /** Sizing shared across hand/meld/discard tiles alike. */
  shared: {
    /** height / width. Range: [1.2, 1.8]. */
    aspectRatio: number;
    /** Gap between adjacent tiles, in px. Range: [0, 8]. */
    tileGapPx: number;
  };
  /** The hand-bottom/-left/-right/-top zone family. */
  handZone: {
    /** Height % of the Hand zone. Range: [5, 80]. */
    tileHeight: number;
  };
  /** The meld-bottom/-left/-right/-top zone family. */
  meldZone: {
    /** Height % of the Meld column, bottom-aligned within it. Range: [10, 100]. */
    meldHeight: number;
    /** Tile height % within the meld row. Range: [5, 80]. */
    meldTileHeight: number;
  };
  /** The discard-bottom/-left/-right/-top zone family. */
  discardZone: {
    /** Range: [4, 14]. */
    columns: number;
    /** Range: [2, 4]. */
    rows: number;
    /** Row height % of the pile. Range: [5, 80]. */
    discardShort: number;
  };
  /** The single action-dock zone. See components/mahjong/ActionDock.tsx. */
  actionDockZone: {
    /** Height % of the Actions row within the whole dock; the Options row gets the rest. Range: [20, 60]. */
    actionsHeight: number;
    /** Action button height % of the Actions row. Range: [30, 90]. */
    actionButtonHeight: number;
    /** Two-character label button width = height × ratio (one-character buttons stay square). Range: [1.0, 2.0]. */
    wideLabelWidthRatio: number;
    /** Candidate tile height % of the Options row. Range: [30, 90]. */
    candidateHeight: number;
  };
  debug: { showRegions: boolean };
};

/** Default for new Lab drafts and legacy layout files that predate Config Panel. */
export const DEFAULT_TABLE_LAYOUT_CONFIG: TableLayoutConfig = {
  shared: { aspectRatio: 1.333, tileGapPx: 1.9 },
  handZone: { tileHeight: 65 },
  meldZone: { meldHeight: 100, meldTileHeight: 80 },
  discardZone: { columns: 8, rows: 3, discardShort: 26 },
  actionDockZone: {
    actionsHeight: 40,
    actionButtonHeight: 70,
    wideLabelWidthRatio: 1.4,
    candidateHeight: 70,
  },
  debug: { showRegions: false },
};

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const number = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${name} must be a number from ${min} to ${max}`);
  return value;
};

/** Runtime boundary for JSON authored by Layout Lab. */
export function parseTableLayoutConfig(value: unknown): TableLayoutConfig {
  const config = object(value);
  const shared = object(config.shared);
  const handZone = object(config.handZone);
  const meldZone = object(config.meldZone);
  const discardZone = object(config.discardZone);
  const actionDockZone = object(config.actionDockZone);
  const debug = object(config.debug);
  if (typeof debug.showRegions !== "boolean")
    throw new Error("debug.showRegions must be a boolean");
  return {
    shared: {
      aspectRatio: number(shared.aspectRatio, "shared.aspectRatio", 1.2, 1.8),
      tileGapPx: number(shared.tileGapPx, "shared.tileGapPx", 0, 8),
    },
    handZone: { tileHeight: number(handZone.tileHeight, "handZone.tileHeight", 5, 80) },
    meldZone: {
      meldHeight: number(meldZone.meldHeight, "meldZone.meldHeight", 10, 100),
      meldTileHeight: number(meldZone.meldTileHeight, "meldZone.meldTileHeight", 5, 80),
    },
    discardZone: {
      columns: number(discardZone.columns, "discardZone.columns", 4, 14),
      rows: number(discardZone.rows, "discardZone.rows", 2, 4),
      discardShort: number(discardZone.discardShort, "discardZone.discardShort", 5, 80),
    },
    actionDockZone: {
      actionsHeight: number(actionDockZone.actionsHeight, "actionDockZone.actionsHeight", 20, 60),
      actionButtonHeight: number(
        actionDockZone.actionButtonHeight,
        "actionDockZone.actionButtonHeight",
        30,
        90,
      ),
      wideLabelWidthRatio: number(
        actionDockZone.wideLabelWidthRatio,
        "actionDockZone.wideLabelWidthRatio",
        1,
        2,
      ),
      candidateHeight: number(
        actionDockZone.candidateHeight,
        "actionDockZone.candidateHeight",
        30,
        90,
      ),
    },
    debug: { showRegions: debug.showRegions },
  };
}
