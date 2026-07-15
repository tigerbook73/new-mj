import type { SeatId } from "./ids.ts";

/** Stable seat order used by every four-player ruleset. */
export const SEAT_IDS = [0, 1, 2, 3] as const satisfies readonly SeatId[];
export const SEAT_COUNT = SEAT_IDS.length;
