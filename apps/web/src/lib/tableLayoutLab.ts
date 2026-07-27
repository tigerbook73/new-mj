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
