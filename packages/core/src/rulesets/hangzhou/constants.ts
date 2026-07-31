import type { TileKind } from "../../lib/ids.ts";

export const HANGZHOU_PHASES = [
  "dealing",
  "playing",
  "awaiting-claims",
  "awaiting-draw",
  "finished",
] as const;
export const HANGZHOU_MULTI_HU_POLICIES = ["headJump", "all"] as const;

// White dragon is caishen (docs/variants/hangzhou.md §1). This ruleset maps
// honor kinds 1z..7z to East/South/West/North/Red/Green/White; no other
// ruleset gives them semantic names, so this ordering is hangzhou-local.
export const CAISHEN_KIND: TileKind = "7z";
