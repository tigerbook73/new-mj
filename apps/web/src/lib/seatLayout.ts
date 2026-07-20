import type { SeatId } from "@new-mj/protocol";

export type SeatDirection = "bottom" | "left" | "top" | "right";

// Turn order (0→1→2→3→0) runs counter-clockwise around the table, same as
// real mahjong: the next seat to act sits to my right, not my left — hence
// `right`'s offset is 1 (not `left`'s). SEAT_DIRECTIONS' order must track
// DIRECTION_OFFSET's values (directionOf below indexes it by offset).
export const SEAT_DIRECTIONS: readonly SeatDirection[] = ["bottom", "right", "top", "left"];

const DIRECTION_OFFSET: Record<SeatDirection, number> = {
  bottom: 0,
  right: 1,
  top: 2,
  left: 3,
};

/** Seat shown at `direction` relative to `mySeat` (turn order runs 0→1→2→3→0). */
export const seatAt = (mySeat: SeatId, direction: SeatDirection): SeatId =>
  ((mySeat + DIRECTION_OFFSET[direction]) % 4) as SeatId;

/** Inverse of `seatAt`: which direction `seat` renders at, relative to `mySeat`. */
export const directionOf = (mySeat: SeatId, seat: SeatId): SeatDirection =>
  SEAT_DIRECTIONS[(seat - mySeat + 4) % 4]!;

/** Degrees `DirectionalSurface` (components/mahjong/TableGeometry.tsx) rotates each seat's content by; negate to counter-rotate a child back upright. */
export const SEAT_ROTATION: Record<SeatDirection, number> = {
  bottom: 0,
  left: 90,
  top: 180,
  right: -90,
};
