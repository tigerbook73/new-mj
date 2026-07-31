import type { TileKind } from "../../lib/ids.ts";

export const HANGZHOU_PHASES = [
  "dealing",
  "playing",
  "awaiting-claims",
  "awaiting-draw",
  "finished",
] as const;
export const HANGZHOU_MULTI_HU_POLICIES = ["headJump", "all"] as const;

// White dragon (白板) is caishen (docs/variants/hangzhou.md §1). Honor order
// is 1z..7z = East/South/West/North/White/Green/Red — this matches
// apps/web's existing tile-art convention (mahjongTiles.ts's
// TILE_KIND_TO_FILE: 5z→Haku/白, 6z→Hatsu/發, 7z→Chun/中), which core
// doesn't import but must stay numerically consistent with so the caishen
// tile renders as the correct tile face.
export const CAISHEN_KIND: TileKind = "5z";
