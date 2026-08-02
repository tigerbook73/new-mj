import { createEvent, nextEventSeq, type GameEvent } from "../../events.ts";
import { createPrng, nextInt } from "../../lib/prng.ts";
import { createWall } from "../../lib/wall.ts";
import { SEAT_COUNT, SEAT_IDS, nextSeat } from "../../lib/seats.ts";
import { parseBloodbattleConfig } from "./config.ts";
import { BLOODBATTLE_EVENT_TYPES as EVENT_TYPES } from "./events.ts";
import type { SeatId, TileId } from "../../lib/ids.ts";
import type { SeatState } from "../../lib/seat-state.ts";
import type {
  BloodbattleApplyResult,
  BloodbattleConfig,
  BloodbattleErrorCode,
  BloodbattleEventPayload,
  BloodbattleState,
} from "./types.ts";
import { BLOODBATTLE_TILE_SET } from "./constants.ts";

export { BLOODBATTLE_TILE_SET } from "./constants.ts";

const publicVisibility = { type: "public" } as const;
const seatVisibility = (seat: SeatId) => ({ type: "seat" as const, seats: [seat] });

const seats = (): SeatState[] => SEAT_IDS.map(() => ({ hand: [], melds: [], discards: [] }));

// Shared with state-machine.ts: applyAction clones once per call, so this needs
// to stay a hand-rolled shallow-where-safe clone rather than a generic deep
// clone (structuredClone benchmarks ~30x slower on this shape, which would show
// up in the 1000/10000-game fuzz smoke).
export const cloneState = (state: BloodbattleState): BloodbattleState => ({
  ...state,
  wall: [...state.wall],
  scores: [...state.scores] as BloodbattleState["scores"],
  status: [...state.status] as BloodbattleState["status"],
  gangPayments: state.gangPayments.map((payment) => ({ ...payment })),
  seats: state.seats.map((seat) => ({
    hand: [...seat.hand],
    melds: seat.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    discards: seat.discards.map((discard) => ({ ...discard })),
  })),
  ...(state.exchange ? { exchange: { selections: { ...state.exchange.selections } } } : {}),
  ...(state.lack ? { lack: { ...state.lack } } : {}),
  ...(state.wins ? { wins: { ...state.wins } } : {}),
  ...(state.lastDiscard ? { lastDiscard: { ...state.lastDiscard } } : {}),
  ...(state.pendingClaims
    ? {
        pendingClaims: {
          ...state.pendingClaims,
          options: { ...state.pendingClaims.options },
          responses: { ...state.pendingClaims.responses },
        },
      }
    : {}),
});

const appendEvent = (
  state: BloodbattleState,
  events: GameEvent<BloodbattleEventPayload>[],
  visibility: GameEvent["visibility"],
  payload: BloodbattleEventPayload,
): void => {
  state.seq = nextEventSeq(state.seq);
  events.push(createEvent(state.seq, visibility, payload));
};

const fail = (code: BloodbattleErrorCode): BloodbattleApplyResult => ({ error: { code } });

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
  if (direction === 2) return SEAT_IDS[(seat + 2) % SEAT_COUNT]!;
  return SEAT_IDS[(seat + (direction === 0 ? 1 : 3)) % SEAT_COUNT]!;
};

export const createBloodbattlePrelude = (
  seed: number,
  dealer: SeatId,
  config: unknown,
): BloodbattleApplyResult => {
  const parsed = parseBloodbattleConfig(config);
  if ("error" in parsed) return parsed;
  const gameConfig: BloodbattleConfig = parsed.config;

  const shuffled = createWall(createPrng(seed), BLOODBATTLE_TILE_SET);
  const state: BloodbattleState = {
    config: gameConfig,
    phase: gameConfig.exchangeThree ? "exchanging" : "choosing-lack",
    wall: shuffled.wall,
    seats: seats(),
    currentSeat: dealer,
    seq: 0,
    prng: shuffled.prng,
    scores: [0, 0, 0, 0],
    status: ["active", "active", "active", "active"],
    gangPayments: [],
  };
  const events: GameEvent<BloodbattleEventPayload>[] = [];
  appendEvent(state, events, publicVisibility, {
    type: EVENT_TYPES.gameStarted,
    config: state.config,
    dealer,
    handCounts: SEAT_IDS.map((seat) => (seat === dealer ? 14 : 13)),
    wallCount: state.wall.length - 53,
  });
  for (const seat of SEAT_IDS) {
    const count = seat === dealer ? 14 : 13;
    for (let index = 0; index < count; index += 1)
      state.seats[seat]!.hand.push(state.wall.shift()!);
    appendEvent(state, events, seatVisibility(seat), {
      type: EVENT_TYPES.handDealt,
      seat,
      tiles: [...state.seats[seat]!.hand],
    });
  }
  return { state, events };
};

// docs/variants/bloodbattle.md 定稿未提连庄：结果不影响庄家，纯顺时针轮转（D15）。
export const computeNextBloodbattleDealer = (
  _finished: BloodbattleState,
  currentDealer: SeatId,
): SeatId => nextSeat(currentDealer);

export const applyExchangeThree = (
  state: BloodbattleState,
  seat: SeatId,
  tiles: [TileId, TileId, TileId],
): BloodbattleApplyResult => {
  if (state.phase !== "exchanging") return fail("EXCHANGE_NOT_OPEN");
  if (state.exchange?.selections[seat]) return fail("ALREADY_SUBMITTED");
  const hand = state.seats[seat]!.hand;
  if (new Set(tiles).size !== 3 || tiles.some((tile) => !hand.includes(tile))) {
    return fail("INVALID_EXCHANGE_TILES");
  }
  const suits = new Set(tiles.map((tile) => BLOODBATTLE_TILE_SET.kindOf(tile)[1]));
  if (suits.size !== 1) return fail("EXCHANGE_TILES_NOT_SAME_SUIT");

  const clonedState = cloneState(state);
  const events: GameEvent<BloodbattleEventPayload>[] = [];
  clonedState.exchange = clonedState.exchange ?? { selections: {} };
  clonedState.exchange.selections[seat] = tiles;
  appendEvent(clonedState, events, seatVisibility(seat), {
    type: EVENT_TYPES.exchangeThreeSelected,
    tiles,
  });

  const selections = clonedState.exchange.selections;
  const allSubmitted = SEAT_IDS.every((candidate) => selections[candidate]);
  if (!allSubmitted) return { state: clonedState, events };

  const direction = nextInt(clonedState.prng, 3);
  clonedState.prng = direction.prng;
  for (const candidate of SEAT_IDS) {
    const outgoing = selections[candidate]!;
    clonedState.seats[candidate]!.hand = removeTiles(clonedState.seats[candidate]!.hand, outgoing)!;
  }
  for (const candidate of SEAT_IDS) {
    const receiver = receiverOf(candidate, direction.value as 0 | 1 | 2);
    const incoming = selections[candidate]!;
    clonedState.seats[receiver]!.hand.push(...incoming);
    appendEvent(clonedState, events, seatVisibility(receiver), {
      type: EVENT_TYPES.tilesReceived,
      tiles: incoming,
    });
  }
  delete clonedState.exchange;
  appendEvent(clonedState, events, publicVisibility, {
    type: EVENT_TYPES.exchangeCompleted,
    direction: direction.value,
  });
  clonedState.phase = "choosing-lack";
  return { state: clonedState, events };
};

export const applyChooseLack = (
  state: BloodbattleState,
  seat: SeatId,
  suit: "m" | "p" | "s",
): BloodbattleApplyResult => {
  if (state.phase !== "choosing-lack") return fail("LACK_NOT_OPEN");
  if (state.lack?.[seat]) return fail("ALREADY_SUBMITTED");
  const hand = state.seats[seat]!.hand;
  if (!hand.some((tile) => BLOODBATTLE_TILE_SET.kindOf(tile)[1] === suit))
    return fail("SUIT_NOT_HELD");

  const clonedState = cloneState(state);
  const events: GameEvent<BloodbattleEventPayload>[] = [];
  clonedState.lack = clonedState.lack ?? {};
  clonedState.lack[seat] = suit;
  appendEvent(clonedState, events, seatVisibility(seat), { type: EVENT_TYPES.lackChosen, suit });

  const lack = clonedState.lack;
  const allSubmitted = SEAT_IDS.every((candidate) => lack[candidate]);
  if (!allSubmitted) return { state: clonedState, events };

  clonedState.phase = "playing";
  appendEvent(clonedState, events, publicVisibility, {
    type: EVENT_TYPES.turnStarted,
    seat: clonedState.currentSeat,
  });
  return { state: clonedState, events };
};
