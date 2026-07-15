import { assertTileConservation } from "@/lib/invariants.ts";
import { createEvent, nextEventSeq, type GameEvent } from "@/events.ts";
import { createPrng, nextInt } from "@/lib/prng.ts";
import { STANDARD_TILE_SET } from "@/lib/tiles.ts";
import { createWall, drawFromHead, drawFromTail } from "@/lib/wall.ts";
import { isSevenPairsWinningHand, isStandardWinningHand } from "@/lib/win.ts";
import type { SeatId, TileId, TileKind } from "@/lib/ids.ts";
import type { SeatState } from "@/lib/seat.ts";
import { DEFAULT_JUNK_CONFIG, parseJunkConfig } from "./config.ts";
import type {
  JunkApplyResult,
  JunkClaimOption,
  JunkConfig,
  JunkGameResult,
  JunkPendingClaims,
  JunkState,
} from "./types.ts";

export const seats = (): SeatState[] =>
  [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));
export const nextSeat = (seat: SeatId): SeatId => ((seat + 1) % 4) as SeatId;
export const cloneState = (state: JunkState): JunkState => {
  const cloned: JunkState = {
    ...state,
    wall: [...state.wall],
    seats: state.seats.map((seat) => ({
      hand: [...seat.hand],
      melds: seat.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
      discards: seat.discards.map((discard) => ({ ...discard })),
    })),
  };
  if (state.pendingClaims) {
    cloned.pendingClaims = {
      discard: { ...state.pendingClaims.discard },
      options: { ...state.pendingClaims.options },
      responses: { ...state.pendingClaims.responses },
    };
  }
  return cloned;
};

export const publicVisibility = { type: "public" } as const;
export const seatVisibility = (seat: SeatId) => ({ type: "seat" as const, seats: [seat] });

export const appendEvent = (
  state: JunkState,
  events: GameEvent[],
  visibility: GameEvent["visibility"],
  payload: unknown,
): void => {
  state.seq = nextEventSeq(state.seq);
  events.push(createEvent(state.seq, visibility, payload));
};

export const fail = (code: string): JunkApplyResult => ({ error: { code } });

export const configOf = (state: JunkState): JunkConfig => ({
  ...DEFAULT_JUNK_CONFIG,
  ...state.config,
  rulesetId: "junk",
});

export const sameKind = (tiles: readonly TileId[], kind: TileKind): TileId[] =>
  tiles.filter((tile) => STANDARD_TILE_SET.kindOf(tile) === kind);

export const removeTiles = (
  hand: readonly TileId[],
  tiles: readonly TileId[],
): TileId[] | undefined => {
  const remaining = [...hand];
  for (const tile of tiles) {
    const index = remaining.indexOf(tile);
    if (index < 0) return undefined;
    remaining.splice(index, 1);
  }
  return remaining;
};

export const tileRank = (tile: TileId): number => Number(STANDARD_TILE_SET.kindOf(tile)[0]);
export const tileSuit = (tile: TileId): string => STANDARD_TILE_SET.kindOf(tile)[1] as string;

export const winningTiles = (state: JunkState, seat: SeatId, extra?: TileId): TileId[] => {
  const own = state.seats[seat] as SeatState;
  const tiles = extra === undefined ? own.hand : [...own.hand, extra];
  return [...tiles, ...own.melds.flatMap((meld) => meld.tiles)];
};

export const isWin = (state: JunkState, seat: SeatId, extra?: TileId): boolean => {
  const tiles = winningTiles(state, seat, extra);
  const own = state.seats[seat]!;
  return (
    isStandardWinningHand(tiles, STANDARD_TILE_SET) ||
    (configOf(state).sevenPairs &&
      own.melds.length === 0 &&
      isSevenPairsWinningHand(tiles, STANDARD_TILE_SET))
  );
};

export const chiOptions = (
  state: JunkState,
  seat: SeatId,
  discarded: TileId,
): JunkClaimOption[] => {
  const kind = STANDARD_TILE_SET.kindOf(discarded);
  if (kind.endsWith("z")) return [];
  const rank = tileRank(discarded);
  const suit = tileSuit(discarded);
  const hand = state.seats[seat]!.hand;
  const options: JunkClaimOption[] = [];
  const combinations: Array<[number, number]> = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];
  for (const [first, second] of combinations) {
    if (first < 1 || second > 9) continue;
    const firstTile = hand.find((tile) => STANDARD_TILE_SET.kindOf(tile) === `${first}${suit}`);
    const secondTile = hand.find(
      (tile) => STANDARD_TILE_SET.kindOf(tile) === `${second}${suit}` && tile !== firstTile,
    );
    if (firstTile !== undefined && secondTile !== undefined) {
      options.push({ action: { type: "chi", tiles: [firstTile, secondTile] } });
    }
  }
  return options;
};

export const claimOptions = (state: JunkState, seat: SeatId): JunkClaimOption[] => {
  const pending = state.pendingClaims;
  if (!pending || pending.discard.seat === seat) return [];
  const tile = pending.discard.tile;
  if (pending.source === "robKong")
    return isWin(state, seat, tile) ? [{ action: { type: "hu" } }] : [];
  const kind = STANDARD_TILE_SET.kindOf(tile);
  const hand = state.seats[seat]!.hand;
  const matching = sameKind(hand, kind);
  const options: JunkClaimOption[] = [];
  if (isWin(state, seat, tile)) options.push({ action: { type: "hu" } });
  if (matching.length >= 3) options.push({ action: { type: "minGang" } });
  if (matching.length >= 2) options.push({ action: { type: "peng" } });
  if (seat === nextSeat(pending.discard.seat)) options.push(...chiOptions(state, seat, tile));
  return options;
};

export const emitDraw = (
  state: JunkState,
  events: GameEvent[],
  seat: SeatId,
  replacement: boolean,
): boolean => {
  const drawn = replacement ? drawFromTail(state.wall) : drawFromHead(state.wall);
  if (!drawn) {
    state.phase = "finished";
    state.result = { type: "draw", scoreDeltas: [0, 0, 0, 0] };
    appendEvent(state, events, publicVisibility, { type: "WallExhausted" });
    appendEvent(state, events, publicVisibility, { type: "GameEnded", result: state.result });
    return false;
  }
  state.wall = drawn.wall;
  state.seats[seat]!.hand.push(drawn.tile);
  appendEvent(state, events, publicVisibility, {
    type: replacement ? "GangReplacementDrawn" : "TileDrawn",
    seat,
  });
  appendEvent(state, events, seatVisibility(seat), {
    type: replacement ? "GangReplacementDrawn" : "TileDrawn",
    seat,
    tile: drawn.tile,
  });
  return true;
};

export const beginTurn = (
  state: JunkState,
  events: GameEvent[],
  seat: SeatId,
  draw: boolean,
  replacement = false,
): void => {
  state.currentSeat = seat;
  state.phase = "playing";
  if (draw && !emitDraw(state, events, seat, replacement)) return;
  appendEvent(state, events, publicVisibility, { type: "TurnStarted", seat });
};

export const settleWins = (
  winners: SeatId[],
  winType: "zimo" | "ron",
  from?: SeatId,
): JunkGameResult => {
  const scoreDeltas: [number, number, number, number] = [0, 0, 0, 0];
  if (winType === "zimo") {
    for (const seat of [0, 1, 2, 3] as SeatId[]) {
      if (seat === winners[0]) continue;
      scoreDeltas[seat] -= 1;
      scoreDeltas[winners[0]!] += 1;
    }
  } else if (from !== undefined) {
    for (const winner of winners) {
      scoreDeltas[from] -= 1;
      scoreDeltas[winner] += 1;
    }
  }
  return from === undefined
    ? { type: "win", winner: winners[0]!, winners, winType, scoreDeltas }
    : { type: "win", winner: winners[0]!, winners, winType, from, scoreDeltas };
};

export const finishWin = (
  state: JunkState,
  events: GameEvent[],
  winner: SeatId,
  winType: "zimo" | "ron",
  from?: SeatId,
  winningTile?: TileId,
): void => {
  const result = settleWins([winner], winType, from);
  state.phase = "finished";
  state.result = result;
  const revealedHand =
    winningTile === undefined
      ? [...state.seats[winner]!.hand]
      : [...state.seats[winner]!.hand, winningTile];
  const payload =
    from === undefined
      ? { type: "HuDeclared", seat: winner, winType, hand: revealedHand }
      : { type: "HuDeclared", seat: winner, winType, hand: revealedHand, from };
  appendEvent(state, events, publicVisibility, payload);
  appendEvent(state, events, publicVisibility, {
    type: "Settled",
    scoreDeltas: result.scoreDeltas,
  });
  appendEvent(state, events, publicVisibility, { type: "GameEnded", result });
};

export const finishRonWins = (
  state: JunkState,
  events: GameEvent[],
  winners: SeatId[],
  from: SeatId,
  tile: TileId,
): void => {
  const result = settleWins(winners, "ron", from);
  state.phase = "finished";
  state.result = result;
  for (const winner of winners) {
    appendEvent(state, events, publicVisibility, {
      type: "HuDeclared",
      seat: winner,
      winType: "ron",
      hand: [...state.seats[winner]!.hand, tile],
      from,
    });
  }
  appendEvent(state, events, publicVisibility, {
    type: "Settled",
    scoreDeltas: result.scoreDeltas,
  });
  appendEvent(state, events, publicVisibility, { type: "GameEnded", result });
};

export const resolveUnclaimed = (state: JunkState, events: GameEvent[]): void => {
  if (state.pendingClaims!.source === "robKong") {
    const { seat, tile } = state.pendingClaims!.discard;
    delete state.pendingClaims;
    const meld = state.seats[seat]!.melds.find(
      (candidate) =>
        candidate.type === "peng" &&
        STANDARD_TILE_SET.kindOf(candidate.tiles[0]!) === STANDARD_TILE_SET.kindOf(tile),
    )!;
    state.seats[seat]!.hand = removeTiles(state.seats[seat]!.hand, [tile])!;
    meld.type = "buGang";
    meld.tiles.push(tile);
    appendEvent(state, events, publicVisibility, {
      type: "ClaimWindowResolved",
      result: "unclaimed",
    });
    appendEvent(state, events, publicVisibility, {
      type: "GangMade",
      seat,
      gangType: "buGang",
      tiles: [...meld.tiles],
    });
    beginTurn(state, events, seat, true, true);
    return;
  }
  const discardedBy = state.pendingClaims!.discard.seat;
  delete state.pendingClaims;
  appendEvent(state, events, publicVisibility, {
    type: "ClaimWindowResolved",
    result: "unclaimed",
  });
  beginTurn(state, events, nextSeat(discardedBy), true);
};

export const applyDiscard = (
  state: JunkState,
  seat: SeatId,
  tile: TileId,
  events: GameEvent[],
): JunkApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  const hand = state.seats[seat]!.hand;
  const remaining = removeTiles(hand, [tile]);
  if (!remaining) return fail("TILE_NOT_IN_HAND");
  state.seats[seat]!.hand = remaining;
  state.seats[seat]!.discards.push({ tile });
  state.lastDiscard = { seat, tile };
  appendEvent(state, events, publicVisibility, { type: "TileDiscarded", seat, tile });
  const options: JunkPendingClaims = {
    discard: { seat, tile },
    options: {},
    responses: {},
  };
  state.pendingClaims = options;
  for (const candidate of [0, 1, 2, 3] as SeatId[]) {
    const candidateOptions = claimOptions(state, candidate);
    if (candidateOptions.length === 0) continue;
    options.options[candidate] = candidateOptions;
    appendEvent(state, events, seatVisibility(candidate), {
      type: "ClaimWindowOpened",
      options: candidateOptions,
    });
  }
  if (Object.keys(options.options).length === 0) {
    resolveUnclaimed(state, events);
  } else {
    state.phase = "awaiting-claims";
  }
  return { state, events };
};

export const applyAnGang = (
  state: JunkState,
  seat: SeatId,
  kind: TileKind,
  events: GameEvent[],
): JunkApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  const tiles = sameKind(state.seats[seat]!.hand, kind).slice(0, 4);
  if (tiles.length !== 4) return fail("GANG_NOT_AVAILABLE");
  state.seats[seat]!.hand = removeTiles(state.seats[seat]!.hand, tiles)!;
  state.seats[seat]!.melds.push({ type: "anGang", tiles });
  appendEvent(state, events, publicVisibility, { type: "GangMade", seat, gangType: "anGang" });
  appendEvent(state, events, seatVisibility(seat), {
    type: "GangMade",
    seat,
    gangType: "anGang",
    tiles,
  });
  beginTurn(state, events, seat, true, true);
  return { state, events };
};

export const applyBuGang = (
  state: JunkState,
  seat: SeatId,
  tile: TileId,
  events: GameEvent[],
): JunkApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  if (!state.seats[seat]!.hand.includes(tile)) return fail("TILE_NOT_IN_HAND");
  const kind = STANDARD_TILE_SET.kindOf(tile);
  const meld = state.seats[seat]!.melds.find(
    (candidate) =>
      candidate.type === "peng" && STANDARD_TILE_SET.kindOf(candidate.tiles[0]!) === kind,
  );
  if (!meld) return fail("GANG_NOT_AVAILABLE");
  if (configOf(state).robKong) {
    state.pendingClaims = {
      discard: { seat, tile },
      source: "robKong",
      options: {},
      responses: {},
    };
    for (const candidate of [0, 1, 2, 3] as SeatId[]) {
      const candidateOptions = claimOptions(state, candidate);
      if (candidateOptions.length === 0) continue;
      state.pendingClaims.options[candidate] = candidateOptions;
      appendEvent(state, events, seatVisibility(candidate), {
        type: "ClaimWindowOpened",
        options: candidateOptions,
      });
    }
    if (Object.keys(state.pendingClaims.options).length > 0) {
      state.phase = "awaiting-claims";
      return { state, events };
    }
    resolveUnclaimed(state, events);
    return { state, events };
  }
  state.seats[seat]!.hand = removeTiles(state.seats[seat]!.hand, [tile])!;
  meld.type = "buGang";
  meld.tiles.push(tile);
  appendEvent(state, events, publicVisibility, {
    type: "GangMade",
    seat,
    gangType: "buGang",
    tiles: [...meld.tiles],
  });
  beginTurn(state, events, seat, true, true);
  return { state, events };
};

export const createJunkGame = (seed: number, config: unknown = {}): JunkApplyResult => {
  const parsed = parseJunkConfig(config);
  if ("error" in parsed) return parsed;
  const first = nextInt(createPrng(seed), 4);
  const dealer = first.value as SeatId;
  const shuffled = createWall(first.prng);
  const state: JunkState = {
    config: parsed.config,
    phase: "dealing",
    wall: shuffled.wall,
    seats: seats(),
    currentSeat: dealer,
    seq: 0,
    prng: shuffled.prng,
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
  state.phase = "playing";
  appendEvent(state, events, publicVisibility, { type: "TurnStarted", seat: dealer });
  assertTileConservation(state);
  return { state, events };
};
