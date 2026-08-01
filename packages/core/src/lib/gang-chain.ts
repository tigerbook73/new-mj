import type { SeatId } from "./ids.ts";

/**
 * Per-seat consecutive-gang counter shared by junk (docs/variants/junk.md §3) and
 * hangzhou (docs/variants/hangzhou.md §6): every gang (an/ming/bu) increments the
 * acting seat's own count by 1; that seat's next discard resets it to 0. Only the
 * winning seat's own count at the moment of a zimo feeds gangkai/gangshang scoring.
 */
export type GangChain = [number, number, number, number];

export const createGangChain = (): GangChain => [0, 0, 0, 0];

export const incrementGangChain = (chain: GangChain, seat: SeatId): void => {
  chain[seat] += 1;
};

export const resetGangChain = (chain: GangChain, seat: SeatId): void => {
  chain[seat] = 0;
};
