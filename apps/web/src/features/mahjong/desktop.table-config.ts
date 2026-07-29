import type { LayoutPreset } from "@/shared/lib/layoutPreset";
import {
  parseTableLayoutConfig,
  type TableLayoutConfig,
} from "@/features/mahjong/lib/tableLayoutConfig";
import desktopTableLayoutJson from "./layouts/desktop.table-layout.json";

/** The checked-in Layout Lab export is the production desktop layout source of truth. */
export const desktopTableLayout = desktopTableLayoutJson as LayoutPreset;

/** The same checked-in document supplies geometry and presentation parameters. */
export const desktopTableLayoutConfig: TableLayoutConfig = parseTableLayoutConfig(
  desktopTableLayoutJson.tableConfig,
);
