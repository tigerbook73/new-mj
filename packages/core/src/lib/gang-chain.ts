import type { SeatId } from "./ids.ts";

/**
 * junk（docs/variants/junk.md §3）与 hangzhou（docs/variants/hangzhou.md §6）共用的
 * 每座位连续杠计数：任一种杠（暗/明/补）给行动座位自己 +1，该座位下一次打出牌清零；
 * 自摸时只有赢家自己的计数参与杠开/杠上开花计分。
 */
export type GangChain = [number, number, number, number];

export const createGangChain = (): GangChain => [0, 0, 0, 0];

export const incrementGangChain = (chain: GangChain, seat: SeatId): void => {
  chain[seat] += 1;
};

export const resetGangChain = (chain: GangChain, seat: SeatId): void => {
  chain[seat] = 0;
};
