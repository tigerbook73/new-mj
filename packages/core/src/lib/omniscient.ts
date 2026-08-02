import type { TileId } from "./ids.ts";
import type { TileContainerState } from "./invariants.ts";

export type OmniscientView = {
  wall: readonly TileId[];
  hands: ReadonlyArray<readonly TileId[]>;
  /** Per seat, per meld (same order as the seat's real `melds`), unredacted
   * tiles — unlike `getPlayerView`, which empties an anGang's `tiles` for
   * every seat but its owner (see junk/view.ts), this exposes anGang tiles
   * for all seats too. */
  melds: ReadonlyArray<ReadonlyArray<readonly TileId[]>>;
};

/**
 * Debug/testing-only escape hatch — NOT part of the frozen four-signature
 * engine-api and NOT a RulesetModule dispatch method (see
 * engine-contract.md §8). Deliberately exposes concealed hand tiles,
 * undrawn wall tiles, and unredacted meld tiles; callers (server) must gate
 * access themselves. Generic over any ruleset whose state shares the
 * `{ wall, seats }` shape, same assumption `assertContainerUniqueness`
 * already makes.
 */
export const getOmniscientView = <S extends TileContainerState>(state: S): OmniscientView => ({
  wall: [...state.wall],
  hands: state.seats.map((seat) => [...seat.hand]),
  melds: state.seats.map((seat) => seat.melds.map((meld) => [...meld.tiles])),
});
