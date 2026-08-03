import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import { SEAT_ROTATION } from "@/features/mahjong/lib/seatLayout";

/** Converts a viewport-space FLIP delta into a rotated seat zone's local axes. */
export function screenDeltaToLocal(
  direction: SeatDirection,
  dx: number,
  dy: number,
): [number, number] {
  switch (SEAT_ROTATION[direction]) {
    case 90:
      return [dy, -dx];
    case -90:
      return [-dy, dx];
    case 180:
      return [-dx, -dy];
    default:
      return [dx, dy];
  }
}
