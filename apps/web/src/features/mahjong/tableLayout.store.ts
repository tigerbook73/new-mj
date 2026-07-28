import { create } from "zustand";
import type { TileTheme } from "@/features/mahjong/lib/mahjongTiles";

/**
 * Pure display state for the mahjong table, kept separate from
 * useSessionStore (unrelated concern — visual preference, not session/socket
 * state). Tile pixel sizing itself is no longer store-driven or measured at
 * all: hand, discard and meld tiles are sized with plain CSS (percentage
 * height, CSS `aspect-ratio` for width), and InfoSlot's rotated footprint /
 * font size use container query units (cqw/cqh) — see
 * docs/architecture/frontend-layout.md's formal Table boundary.
 */
export type TableLayoutState = {
  tileTheme: TileTheme;
  setTileTheme: (theme: TileTheme) => void;
};

export const useTableLayoutStore = create<TableLayoutState>((set) => ({
  tileTheme: "Regular",
  setTileTheme: (tileTheme) => set({ tileTheme }),
}));
