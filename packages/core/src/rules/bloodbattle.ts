import { createEvent, nextEventSeq } from "../events.ts";
import { createPrng, nextInt } from "../lib/prng.ts";
import type { RuleSetApplyResult } from "../ruleset.ts";
import { TILE_KINDS, createTileSet } from "../lib/tiles.ts";
import { createWall } from "../lib/wall.ts";
import type { GameConfig, GameEvent, GameState, SeatId, SeatState, TileId } from "../types.ts";

// Bloodbattle-private variantState slice for the pre-play phases (D6
// namespacing). Each seat's private submission is recorded here, mirroring
// the Partial<Record<SeatId, T>> idiom PendingClaims.responses already uses.
export type BloodbattleVariantState = {
  exchange?: { selections: Partial<Record<SeatId, [TileId, TileId, TileId]>> };
  lack?: Partial<Record<SeatId, "m" | "p" | "s">>;
};

// 108 tiles: m/p/s 1-9 x4, no honors (rules-bloodbattle.md §1).
const BLOODBATTLE_TILE_SET = createTileSet(
  TILE_KINDS.filter((kind) => !kind.endsWith("z")),
  4,
);

const publicVisibility = { type: "public" } as const;
const seatVisibility = (seat: SeatId) => ({ type: "seat" as const, seats: [seat] });

const seats = (): SeatState[] => [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));

const cloneState = (state: GameState): GameState => ({
  ...state,
  wall: [...state.wall],
  seats: state.seats.map((seat) => ({
    hand: [...seat.hand],
    melds: seat.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    discards: seat.discards.map((discard) => ({ ...discard })),
  })),
  variantState: structuredClone(state.variantState),
});

const appendEvent = (
  state: GameState,
  events: GameEvent[],
  visibility: GameEvent["visibility"],
  payload: unknown,
): void => {
  state.seq = nextEventSeq(state.seq);
  events.push(createEvent(state.seq, visibility, payload));
};

const fail = (code: string): RuleSetApplyResult => ({ error: { code } });

const removeTiles = (hand: readonly TileId[], tiles: readonly TileId[]): TileId[] | undefined => {
  const remaining = [...hand];
  for (const tile of tiles) {
    const index = remaining.indexOf(tile);
    if (index < 0) return undefined;
    remaining.splice(index, 1);
  }
  return remaining;
};

// direction 0 = pass right (to nextSeat), 1 = pass left (to previous seat),
// 2 = pass across; matches rules-bloodbattle.md §1's "均匀决定向左、向右或对家交换".
const receiverOf = (seat: SeatId, direction: 0 | 1 | 2): SeatId => {
  if (direction === 2) return ((seat + 2) % 4) as SeatId;
  return ((seat + (direction === 0 ? 1 : 3)) % 4) as SeatId;
};

export const createBloodbattlePrelude = (seed: number, config: unknown): RuleSetApplyResult => {
  const configObject =
    typeof config === "object" && config !== null ? (config as Record<string, unknown>) : {};
  const exchangeThree = configObject.exchangeThree !== false;
  const gameConfig: GameConfig = { ...configObject, rulesetId: "bloodbattle", exchangeThree };

  const first = nextInt(createPrng(seed), 4);
  const dealer = first.value as SeatId;
  const shuffled = createWall(first.prng, BLOODBATTLE_TILE_SET);
  const state: GameState = {
    config: gameConfig,
    phase: exchangeThree ? "exchanging" : "choosing-lack",
    wall: shuffled.wall,
    seats: seats(),
    currentSeat: dealer,
    seq: 0,
    prng: shuffled.prng,
    variantState: {} satisfies BloodbattleVariantState,
  };
  const events: GameEvent[] = [];
  appendEvent(state, events, publicVisibility, {
    type: "GameStarted",
    config: state.config,
    dealer,
    handCounts: ([0, 1, 2, 3] as SeatId[]).map((seat) => (seat === dealer ? 14 : 13)),
    wallCount: state.wall.length - 53,
  });
  for (const seat of [0, 1, 2, 3] as SeatId[]) {
    const count = seat === dealer ? 14 : 13;
    for (let index = 0; index < count; index += 1)
      state.seats[seat]!.hand.push(state.wall.shift()!);
    appendEvent(state, events, seatVisibility(seat), {
      type: "HandDealt",
      seat,
      tiles: [...state.seats[seat]!.hand],
    });
  }
  return { state, events };
};

export const applyExchangeThree = (
  state: GameState,
  seat: SeatId,
  tiles: [TileId, TileId, TileId],
): RuleSetApplyResult => {
  if (state.phase !== "exchanging") return fail("EXCHANGE_NOT_OPEN");
  const variantState = state.variantState as BloodbattleVariantState;
  if (variantState.exchange?.selections[seat]) return fail("ALREADY_SUBMITTED");
  const hand = state.seats[seat]!.hand;
  if (new Set(tiles).size !== 3 || tiles.some((tile) => !hand.includes(tile))) {
    return fail("INVALID_EXCHANGE_TILES");
  }
  const suits = new Set(tiles.map((tile) => BLOODBATTLE_TILE_SET.kindOf(tile)[1]));
  if (suits.size !== 1) return fail("EXCHANGE_TILES_NOT_SAME_SUIT");

  const clonedState = cloneState(state);
  const events: GameEvent[] = [];
  const clonedVariant = clonedState.variantState as BloodbattleVariantState;
  clonedVariant.exchange = clonedVariant.exchange ?? { selections: {} };
  clonedVariant.exchange.selections[seat] = tiles;
  appendEvent(clonedState, events, seatVisibility(seat), { type: "ExchangeThreeSelected", tiles });

  const selections = clonedVariant.exchange.selections;
  const allSubmitted = ([0, 1, 2, 3] as SeatId[]).every((candidate) => selections[candidate]);
  if (!allSubmitted) return { state: clonedState, events };

  const direction = nextInt(clonedState.prng, 3);
  clonedState.prng = direction.prng;
  for (const candidate of [0, 1, 2, 3] as SeatId[]) {
    const outgoing = selections[candidate]!;
    clonedState.seats[candidate]!.hand = removeTiles(clonedState.seats[candidate]!.hand, outgoing)!;
  }
  for (const candidate of [0, 1, 2, 3] as SeatId[]) {
    const receiver = receiverOf(candidate, direction.value as 0 | 1 | 2);
    const incoming = selections[candidate]!;
    clonedState.seats[receiver]!.hand.push(...incoming);
    appendEvent(clonedState, events, seatVisibility(receiver), {
      type: "TilesReceived",
      tiles: incoming,
    });
  }
  delete clonedVariant.exchange;
  appendEvent(clonedState, events, publicVisibility, {
    type: "ExchangeCompleted",
    direction: direction.value,
  });
  clonedState.phase = "choosing-lack";
  return { state: clonedState, events };
};

export const applyChooseLack = (
  state: GameState,
  seat: SeatId,
  suit: "m" | "p" | "s",
): RuleSetApplyResult => {
  if (state.phase !== "choosing-lack") return fail("LACK_NOT_OPEN");
  const variantState = state.variantState as BloodbattleVariantState;
  if (variantState.lack?.[seat]) return fail("ALREADY_SUBMITTED");
  const hand = state.seats[seat]!.hand;
  if (!hand.some((tile) => BLOODBATTLE_TILE_SET.kindOf(tile)[1] === suit))
    return fail("SUIT_NOT_HELD");

  const clonedState = cloneState(state);
  const events: GameEvent[] = [];
  const clonedVariant = clonedState.variantState as BloodbattleVariantState;
  clonedVariant.lack = clonedVariant.lack ?? {};
  clonedVariant.lack[seat] = suit;
  appendEvent(clonedState, events, seatVisibility(seat), { type: "LackChosen", suit });

  const lack = clonedVariant.lack;
  const allSubmitted = ([0, 1, 2, 3] as SeatId[]).every((candidate) => lack[candidate]);
  if (!allSubmitted) return { state: clonedState, events };

  clonedState.phase = "playing";
  appendEvent(clonedState, events, publicVisibility, {
    type: "TurnStarted",
    seat: clonedState.currentSeat,
  });
  return { state: clonedState, events };
};
