import type { SeatId, TileId } from "./ids.ts";
import type { SeatState } from "./seat.ts";
import type { TileSet } from "./tiles.ts";
import { STANDARD_TILE_SET } from "./tiles.ts";

export class InvariantViolation extends Error {
  public readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "InvariantViolation";
    this.code = code;
  }
}

export type TileContainerState = {
  wall: readonly TileId[];
  seats: readonly SeatState[];
};

const assertId = (id: TileId, tileSet: TileSet): void => {
  if (!Number.isInteger(id) || id < 0 || id >= tileSet.size) {
    throw new InvariantViolation("INVALID_TILE_ID");
  }
};

const addPhysical = (seen: Set<TileId>, id: TileId, tileSet: TileSet): void => {
  assertId(id, tileSet);
  if (seen.has(id)) throw new InvariantViolation("DUPLICATE_TILE");
  seen.add(id);
};

const seatHasMeldTile = <S extends TileContainerState>(
  state: S,
  seat: SeatId,
  tile: TileId,
): boolean => state.seats[seat]?.melds.some((meld) => meld.tiles.includes(tile)) ?? false;

// extraTiles 供 ruleset 声明自身状态内的额外容器（如血战的胡牌快照），
// 使其计入守恒与去重检查，而不必在公共状态形状里新增专用字段。
export type ExtraTiles<S extends TileContainerState = TileContainerState> = (
  state: S,
) => readonly TileId[];

const noExtraTiles: ExtraTiles = () => [];

export const assertContainerUniqueness = <S extends TileContainerState>(
  state: S,
  tileSet: TileSet = STANDARD_TILE_SET,
  extraTiles: ExtraTiles<S> = noExtraTiles,
): void => {
  // claimed discard 是墓碑：物理归属已经转入 meld，只校验其对应副露存在，
  // 不把墓碑再次计入 physical 集合。
  const physical = new Set<TileId>();
  const tombstones = new Set<TileId>();
  state.wall.forEach((id) => addPhysical(physical, id, tileSet));
  state.seats.forEach((seat, seatIndex) => {
    seat.hand.forEach((id) => addPhysical(physical, id, tileSet));
    seat.melds.forEach((meld) => meld.tiles.forEach((id) => addPhysical(physical, id, tileSet)));
    seat.discards.forEach((discard) => {
      assertId(discard.tile, tileSet);
      if (discard.claimedBy === undefined) {
        addPhysical(physical, discard.tile, tileSet);
      } else {
        if (discard.claimedBy === seatIndex) {
          throw new InvariantViolation("SELF_CLAIMED_DISCARD");
        }
        if (tombstones.has(discard.tile)) {
          throw new InvariantViolation("DUPLICATE_TOMBSTONE");
        }
        tombstones.add(discard.tile);
        if (!seatHasMeldTile(state, discard.claimedBy, discard.tile)) {
          throw new InvariantViolation("ORPHAN_TOMBSTONE");
        }
      }
    });
  });
  extraTiles(state).forEach((id) => addPhysical(physical, id, tileSet));
};

export const assertTileConservation = <S extends TileContainerState>(
  state: S,
  tileSet: TileSet = STANDARD_TILE_SET,
  extraTiles: ExtraTiles<S> = noExtraTiles,
): void => {
  assertContainerUniqueness(state, tileSet, extraTiles);
  const physical = new Set<TileId>();
  state.wall.forEach((id) => physical.add(id));
  state.seats.forEach((seat) => {
    seat.hand.forEach((id) => physical.add(id));
    seat.melds.forEach((meld) => meld.tiles.forEach((id) => physical.add(id)));
    seat.discards.forEach((discard) => {
      if (discard.claimedBy === undefined) physical.add(discard.tile);
    });
  });
  extraTiles(state).forEach((id) => physical.add(id));
  if (physical.size !== tileSet.size) {
    throw new InvariantViolation(
      "TILE_CONSERVATION",
      `expected ${tileSet.size}, got ${physical.size}`,
    );
  }
};
