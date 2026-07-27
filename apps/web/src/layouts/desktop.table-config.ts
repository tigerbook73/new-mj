import type { LayoutPreset } from "@/lib/layoutPreset";
import type { TableLayoutConfig } from "@/lib/tableLayoutLab";
import desktopTableLayoutJson from "./desktop.table-layout.json";

/** The checked-in Layout Lab export is the production desktop layout source of truth. */
export const desktopTableLayout = desktopTableLayoutJson as LayoutPreset;

/** Hand-authored presentation parameters for desktopTableLayout above. Edit directly — no Lab UI for this yet. */
export const desktopTableLayoutConfig: TableLayoutConfig = {
  shared: {
    aspectRatio: 1.333,
    tileGapPx: 1.9,
  },
  handZone: {
    tileHeight: 65,
  },
  meldZone: {
    meldHeight: 100,
    meldTileHeight: 80,
  },
  discardZone: {
    columns: 8,
    rows: 3,
    discardShort: 26,
  },
  actionDockZone: {
    actionsHeight: 40,
    actionButtonHeight: 70,
    wideLabelWidthRatio: 1.4,
    candidateHeight: 70,
  },
  debug: { showRegions: false },
};
