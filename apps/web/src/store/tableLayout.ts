import { create } from "zustand";

/**
 * Table-wide tile scale, kept separate from useSessionStore (unrelated
 * concern — pure layout, not session/socket state). A ResizeObserver on
 * TableView's outer container measures available width and derives
 * `tileUnit`; every Tile reads it and multiplies by its own size variant.
 * JS-measured rather than pure CSS container queries on purpose: apps/mobile
 * (Expo/React Native) has no CSS container queries at all and will need JS
 * layout measurement regardless (docs/process/plan.md 待办 "mobile 具体路线"
 * is still undecided) — this "measure → derive a shared unit → store it"
 * shape is the one that has a chance of porting conceptually.
 */
export type TableLayoutState = {
  /** Pixels per scale unit; 0 means not measured yet. */
  tileUnit: number;
  setTileUnit: (px: number) => void;
};

export const useTableLayoutStore = create<TableLayoutState>((set) => ({
  tileUnit: 0,
  setTileUnit: (px) => set({ tileUnit: px }),
}));
