import type { LayoutPreset } from "./layoutPreset";
import { DEFAULT_TABLE_LAYOUT_CONFIG, type TableLayoutConfig } from "./tableLayoutLab";
import desktopTableLayout from "../layouts/desktop.table-layout.json";

export type TableLayoutMetrics = TableLayoutConfig;

/** The checked-in Layout Lab export is the production desktop layout source of truth. */
export const DESKTOP_TABLE_PRESET = desktopTableLayout as LayoutPreset;

/** Component-internal tile-sizing inputs; Zone placement itself comes from DESKTOP_TABLE_PRESET above. */
export const DESKTOP_TABLE_METRICS: TableLayoutMetrics = DEFAULT_TABLE_LAYOUT_CONFIG;
