import { create } from "zustand";
import type { TileTheme } from "@/lib/mahjongTiles";

/**
 * Pure display state for the mahjong table, kept separate from
 * useSessionStore (unrelated concern — visual preference, not session/socket
 * state). Tile pixel sizing itself is no longer store-driven: HandTrack/
 * MeldInfoTrack/DiscardPile each measure their own real container via
 * useMeasuredSize and compute tile size with fitTileGrid, handing it down to
 * HandRow/MeldGroup — see docs/process/table-ux-plan.md's P4.1 "接入正式
 * Table" sub-step.
 */
export type TableLayoutState = {
  tileTheme: TileTheme;
  setTileTheme: (theme: TileTheme) => void;
};

export const useTableLayoutStore = create<TableLayoutState>((set) => ({
  tileTheme: "Regular",
  setTileTheme: (tileTheme) => set({ tileTheme }),
}));
