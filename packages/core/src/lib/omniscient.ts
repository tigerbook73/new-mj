import type { TileId } from "./ids.ts";
import type { TileContainerState } from "./invariants.ts";

export type OmniscientView = {
  wall: readonly TileId[];
  hands: ReadonlyArray<readonly TileId[]>;
};

/**
 * Debug/testing-only escape hatch — NOT part of the frozen four-signature
 * engine-api and NOT a RulesetModule dispatch method (see
 * engine-contract.md §8, decisions.md D19). Deliberately exposes concealed
 * hand tiles and undrawn wall tiles; callers (server) must gate access
 * themselves. Generic over any ruleset whose state shares the `{ wall,
 * seats }` shape, same assumption `assertContainerUniqueness` already makes.
 */
export const getOmniscientView = <S extends TileContainerState>(state: S): OmniscientView => ({
  wall: [...state.wall],
  hands: state.seats.map((seat) => [...seat.hand]),
});
