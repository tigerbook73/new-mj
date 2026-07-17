import type { SeatId } from "@new-mj/protocol";

export type SeatDirection = "bottom" | "left" | "top" | "right";

export const SEAT_DIRECTIONS: readonly SeatDirection[] = ["bottom", "left", "top", "right"];

const DIRECTION_OFFSET: Record<SeatDirection, number> = {
  bottom: 0,
  left: 1,
  top: 2,
  right: 3,
};

/** Seat shown at `direction` relative to `mySeat` (turn order runs 0→1→2→3→0). */
export const seatAt = (mySeat: SeatId, direction: SeatDirection): SeatId =>
  ((mySeat + DIRECTION_OFFSET[direction]) % 4) as SeatId;
