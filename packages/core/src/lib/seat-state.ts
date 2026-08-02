import type { SeatId, TileId } from "./ids.ts";

export type MeldType = "chi" | "peng" | "minGang" | "anGang" | "buGang";

export type Meld = {
  type: MeldType;
  tiles: TileId[];
  from?: SeatId;
};

export type DiscardEntry = {
  tile: TileId;
  claimedBy?: SeatId;
};

export type SeatState = {
  hand: TileId[];
  melds: Meld[];
  discards: DiscardEntry[];
};
