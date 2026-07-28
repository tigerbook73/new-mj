import { create } from "zustand";
import type { TileTheme } from "@/features/mahjong/lib/mahjongTiles";

/**
 * Pure display state for the mahjong table, kept separate from
 * useSessionStore (unrelated concern — visual preference, not session/socket
 * state). Tile pixel sizing itself is no longer store-driven or measured at
 * all: hand, discard and meld tiles are sized with plain CSS (percentage
 * height, CSS `aspect-ratio` for width), and InfoSlot's rotated footprint /
 * font size use container query units (cqw/cqh) — see
 * docs/process/table-ux-plan.md's P4.1 "接入正式 Table" sub-step.
 */
export type TableLayoutState = {
  tileTheme: TileTheme;
  setTileTheme: (theme: TileTheme) => void;
};

export const useTableLayoutStore = create<TableLayoutState>((set) => ({
  tileTheme: "Regular",
  setTileTheme: (tileTheme) => set({ tileTheme }),
}));
