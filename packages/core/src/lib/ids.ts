export const SEATS = [0, 1, 2, 3] as const;
export type SeatId = (typeof SEATS)[number];

export type TileId = number;
export type TileKind =
  `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${"m" | "p" | "s"}` | `${1 | 2 | 3 | 4 | 5 | 6 | 7}${"z"}`;
