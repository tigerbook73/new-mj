import { allTileIds, STANDARD_TILE_SET, type TileSet } from "./tiles.ts";
import { shuffle, type PrngState } from "./prng.ts";
import type { TileId } from "./ids.ts";

export type WallResult = {
  wall: TileId[];
  prng: PrngState;
};

export type DrawResult = {
  tile: TileId;
  wall: TileId[];
};

// 垃圾胡规则约定牌墙头摸普通牌、尾部摸杠后补牌；返回新数组，禁止原地修改状态。
export const createWall = (prng: PrngState, tileSet: TileSet = STANDARD_TILE_SET): WallResult => {
  const shuffled = shuffle(allTileIds(tileSet), prng);
  return { wall: shuffled.items, prng: shuffled.prng };
};

export const drawFromHead = (wall: readonly TileId[]): DrawResult | undefined => {
  const [tile, ...remaining] = wall;
  return tile === undefined ? undefined : { tile, wall: remaining };
};

export const drawFromTail = (wall: readonly TileId[]): DrawResult | undefined => {
  if (wall.length === 0) return undefined;
  return { tile: wall[wall.length - 1] as TileId, wall: wall.slice(0, -1) };
};
