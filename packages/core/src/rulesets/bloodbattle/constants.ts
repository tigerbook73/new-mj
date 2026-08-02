import { TILE_KINDS, createTileSet } from "../../lib/tiles.ts";

export const BLOODBATTLE_SUITS = ["m", "p", "s"] as const;
export const BLOODBATTLE_PHASES = [
  "exchanging",
  "choosing-lack",
  "playing",
  "awaiting-claims",
  "awaiting-draw",
  "finished",
] as const;
export const BLOODBATTLE_STATUSES = ["active", "won"] as const;
export const BLOODBATTLE_END_REASONS = ["allWin", "wallExhausted"] as const;
export const BLOODBATTLE_WIN_TYPES = ["zimo", "ron", "robKong"] as const;
export const BLOODBATTLE_DRAW_BONUSES = ["addFan", "addBase"] as const;

// 108 tiles: m/p/s 1-9 x4, no honors (rules-bloodbattle.md §1).
export const BLOODBATTLE_TILE_SET = createTileSet(
  TILE_KINDS.filter((kind) => !kind.endsWith("z")),
  4,
);
