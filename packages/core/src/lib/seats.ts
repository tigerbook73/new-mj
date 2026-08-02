import { SEAT_IDS, type SeatId } from "./ids.ts";

export { SEAT_IDS };

export const SEAT_COUNT = SEAT_IDS.length;

/** 返回固定四座环上的下一座；不决定玩法何时应当轮转。 */
export const nextSeat = (seat: SeatId): SeatId => SEAT_IDS[(seat + 1) % SEAT_COUNT]!;

/** `from` 顺时针走到 `to` 的座位步数，范围为 0 到 3。 */
export const seatDistance = (from: SeatId, to: SeatId): number =>
  (to - from + SEAT_COUNT) % SEAT_COUNT;
