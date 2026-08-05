import { assertTileConservation } from "../../lib/invariants.ts";
import { createEvent, nextEventSeq, type GameEvent } from "../../events.ts";
import { createPrng, nextInt } from "../../lib/prng.ts";
import { SEAT_IDS, nextSeat } from "../../lib/seats.ts";
import {
  STANDARD_TILE_SET,
  sortTileIdsForDisplay,
  sortWinningGroupsForDisplay,
} from "../../lib/tiles.ts";
import { createWall, drawFromHead, drawFromTail } from "../../lib/wall.ts";
import {
  createGangChain,
  incrementGangChain,
  resetGangChain,
  type GangChain,
} from "../../lib/gang-chain.ts";
import {
  decomposeSevenPairsWinningHand,
  decomposeStandardWinningHand,
  isSevenPairsWinningHand,
  isStandardWinningHand,
} from "../../lib/standard-hand.ts";
import type { SeatId, TileId, TileKind } from "../../lib/ids.ts";
import type { SeatState } from "../../lib/seat-state.ts";
import { parseJunkConfig } from "./config.ts";
import { JUNK_EVENT_TYPES as EVENT_TYPES } from "./events.ts";
import { scoreJunkHand, type JunkFanType } from "./scoring.ts";
import type {
  JunkApplyResult,
  JunkClaimOption,
  JunkConfig,
  JunkErrorCode,
  JunkEventPayload,
  JunkGameResult,
  JunkPendingClaims,
  JunkState,
} from "./types.ts";

export const seats = (): SeatState[] => SEAT_IDS.map(() => ({ hand: [], melds: [], discards: [] }));

export const computeInitialJunkDealer = (seed: number): SeatId =>
  nextInt(createPrng(seed), SEAT_IDS.length).value as SeatId;
export const cloneState = (state: JunkState): JunkState => {
  const cloned: JunkState = {
    ...state,
    wall: [...state.wall],
    gangChain: [...state.gangChain] as GangChain,
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
  events: GameEvent<JunkEventPayload>[],
  visibility: GameEvent["visibility"],
  payload: JunkEventPayload,
): void => {
  state.seq = nextEventSeq(state.seq);
  events.push(createEvent(state.seq, visibility, payload));
};

export const fail = (code: JunkErrorCode): JunkApplyResult => ({ error: { code } });

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

/**
 * 只返回暗手（不含已声明的副露），与 isStandardWinningHand 自身的约定一致
 * （"副露由调用方排除在外"）。已声明的副露本身就是一组完整、已验证过的组合，
 * 不管它物理上有几张牌——杠总是会立刻搭配一次补牌（见 applyDrawAction），
 * 所以 `own.hand` 的长度本身已经把手里开出的杠/碰/吃全部算进去了；
 * 如果把副露的牌重新拼回来传给 isStandardWinningHand 判定，会永久打破它的
 * `tiles.length % 3 === 2` 检查（杠是 4 张实体牌，不是这个检查按每副面子
 * 假设的 3 张）——这正是"junk 报过杠后永远胡不了"那个真实 bug 的根源，
 * 已通过只检查暗手来修复。
 */
export const winningTiles = (state: JunkState, seat: SeatId, extra?: TileId): TileId[] => {
  const own = state.seats[seat] as SeatState;
  return extra === undefined ? own.hand : [...own.hand, extra];
};

export const isWin = (state: JunkState, seat: SeatId, extra?: TileId): boolean => {
  const tiles = winningTiles(state, seat, extra);
  const own = state.seats[seat]!;
  return (
    isStandardWinningHand(tiles, STANDARD_TILE_SET) ||
    (own.melds.length === 0 && isSevenPairsWinningHand(tiles, STANDARD_TILE_SET))
  );
};

/** Witness version of isWin: branch order mirrors it exactly so the family found
 * here always matches the one that gated the hu action. Only called once, at the
 * moment a win is actually declared (see lib/standard-hand.ts's decompose functions' own doc). */
const decomposeJunkWin = (
  state: JunkState,
  seat: SeatId,
  tiles: readonly TileId[],
): { family: "standard" | "sevenPairs"; groups: TileKind[][] } => {
  const own = state.seats[seat]!;
  const standard = decomposeStandardWinningHand(tiles, STANDARD_TILE_SET);
  if (standard) return { family: "standard", groups: standard };
  if (own.melds.length === 0) {
    const sevenPairs = decomposeSevenPairsWinningHand(tiles, STANDARD_TILE_SET);
    if (sevenPairs) return { family: "sevenPairs", groups: sevenPairs };
  }
  return { family: "standard", groups: [] }; // unreachable: isWin() already gated this
};

/**
 * Zimo (self-draw win) requires having actually just drawn — a hand can
 * coincidentally already satisfy isWin() right after claiming a chi/peng
 * (whose 2 concealed tiles happen to leave the rest already complete),
 * which is not a self-draw and must not offer `zimo`. `justDrawn` is only
 * set by an actual draw (or the dealer's opening 14th tile, see
 * createJunkGame) and is cleared by discard/chi/peng/gang, so checking it
 * here is sufficient — no separate "did this seat just claim" flag needed.
 */
export const canZimo = (state: JunkState, seat: SeatId): boolean =>
  state.justDrawn?.seat === seat && isWin(state, seat);

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

/** Performs the actual wall-shift + hand-push for a pending draw. Callers must have
 * already verified the wall is non-empty (see beginTurn) — no other action can run
 * between entering "awaiting-draw" and this being invoked, so the wall can't have
 * changed in between. */
export const emitDraw = (
  state: JunkState,
  events: GameEvent<JunkEventPayload>[],
  seat: SeatId,
  replacement: boolean,
): void => {
  const drawn = (replacement ? drawFromTail(state.wall) : drawFromHead(state.wall))!;
  state.wall = drawn.wall;
  state.seats[seat]!.hand.push(drawn.tile);
  state.justDrawn = { seat, tile: drawn.tile };
  appendEvent(state, events, publicVisibility, {
    type: replacement ? "GangReplacementDrawn" : "TileDrawn",
    seat,
  });
  appendEvent(state, events, seatVisibility(seat), {
    type: replacement ? "GangReplacementDrawn" : "TileDrawn",
    seat,
    tile: drawn.tile,
  });
};

/**
 * Advances control to `seat`. When `draw` is false (chi/peng claims never draw), the
 * turn starts immediately. When `draw` is true, this only *schedules* the draw —
 * phase becomes "awaiting-draw" and the actual tile move happens in a later, explicit
 * `applyAction(seat, {type:"draw"})` call (see applyDrawAction below), so the server
 * can pace when that draw becomes visible. Ends the game immediately, as before, if
 * the wall is already empty (no "awaiting-draw" for a game that's ending).
 */
export const beginTurn = (
  state: JunkState,
  events: GameEvent<JunkEventPayload>[],
  seat: SeatId,
  draw: boolean,
  replacement = false,
): void => {
  state.currentSeat = seat;
  if (!draw) {
    state.phase = "playing";
    appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.turnStarted, seat });
    return;
  }
  if (state.wall.length === 0) {
    state.phase = "finished";
    state.result = { type: "draw", scoreDeltas: [0, 0, 0, 0] };
    appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.wallExhausted });
    appendEvent(state, events, publicVisibility, {
      type: EVENT_TYPES.gameEnded,
      result: state.result,
    });
    return;
  }
  state.phase = "awaiting-draw";
  state.pendingDraw = { seat, replacement };
};

/** Explicit `{type:"draw"}` action: completes a draw scheduled by beginTurn. */
export const applyDrawAction = (
  state: JunkState,
  seat: SeatId,
  events: GameEvent<JunkEventPayload>[],
): JunkApplyResult => {
  if (state.phase !== "awaiting-draw" || state.currentSeat !== seat || !state.pendingDraw)
    return fail("DRAW_NOT_AVAILABLE");
  const { replacement } = state.pendingDraw;
  delete state.pendingDraw;
  emitDraw(state, events, seat, replacement);
  state.phase = "playing";
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.turnStarted, seat });
  return { state, events };
};

/** A payment involving the dealer on either side (payer or receiver) is flat
 * ×2 on top of the hand's own fan multiplier — junk.md §3. This doesn't
 * compound when both sides happen to be the dealer (impossible: a seat never
 * pays itself), so a simple either-side check is exactly the rule. */
const edgeAmount = (
  state: JunkState,
  payer: SeatId,
  receiver: SeatId,
  multiplier: number,
): number => (payer === state.dealer || receiver === state.dealer ? multiplier * 2 : multiplier);

export const settleWins = (
  state: JunkState,
  winners: Array<{ seat: SeatId; fanTypes: JunkFanType[]; multiplier: number }>,
  winType: "zimo" | "ron",
  from?: SeatId,
): JunkGameResult => {
  const scoreDeltas: [number, number, number, number] = [0, 0, 0, 0];
  if (winType === "zimo") {
    const { seat: winner, multiplier } = winners[0]!;
    for (const seat of SEAT_IDS) {
      if (seat === winner) continue;
      const amount = edgeAmount(state, seat, winner, multiplier);
      scoreDeltas[seat] -= amount;
      scoreDeltas[winner] += amount;
    }
  } else if (from !== undefined) {
    for (const { seat: winner, multiplier } of winners) {
      const amount = edgeAmount(state, from, winner, multiplier);
      scoreDeltas[from] -= amount;
      scoreDeltas[winner] += amount;
    }
  }
  const winnerSeats = winners.map(({ seat }) => seat);
  const winnerDetails = winners.map(({ seat, fanTypes, multiplier }) => ({
    seat,
    fanTypes,
    multiplier,
    payout: scoreDeltas[seat],
  }));
  return from === undefined
    ? {
        type: "win",
        winner: winnerSeats[0]!,
        winners: winnerSeats,
        winnerDetails,
        winType,
        scoreDeltas,
      }
    : {
        type: "win",
        winner: winnerSeats[0]!,
        winners: winnerSeats,
        winnerDetails,
        winType,
        from,
        scoreDeltas,
      };
};

export const finishWin = (
  state: JunkState,
  events: GameEvent<JunkEventPayload>[],
  winner: SeatId,
  winType: "zimo" | "ron",
  from?: SeatId,
  winningTile?: TileId,
): void => {
  const revealedHand = sortTileIdsForDisplay(
    winningTile === undefined
      ? [...state.seats[winner]!.hand]
      : [...state.seats[winner]!.hand, winningTile],
  );
  const winTile = winningTile ?? state.justDrawn!.tile;
  const { family, groups: rawGroups } = decomposeJunkWin(state, winner, revealedHand);
  const groups = sortWinningGroupsForDisplay(rawGroups);
  const scored = scoreJunkHand({
    family,
    groups,
    melds: state.seats[winner]!.melds.map((meld) => ({
      type: meld.type,
      tiles: meld.tiles.map((tile) => STANDARD_TILE_SET.kindOf(tile)),
    })),
    win: { by: winType },
    gangChainLength: state.gangChain[winner],
  });
  const result = settleWins(
    state,
    [{ seat: winner, fanTypes: scored.fanTypes, multiplier: scored.multiplier }],
    winType,
    from,
  );
  state.phase = "finished";
  state.result = result;
  state.wins = { ...state.wins, [winner]: { hand: revealedHand, winTile, groups } };
  const payload =
    from === undefined
      ? {
          type: EVENT_TYPES.huDeclared,
          seat: winner,
          winType,
          hand: revealedHand,
          winTile,
          groups,
          fanTypes: scored.fanTypes,
          multiplier: scored.multiplier,
        }
      : {
          type: EVENT_TYPES.huDeclared,
          seat: winner,
          winType,
          hand: revealedHand,
          winTile,
          groups,
          fanTypes: scored.fanTypes,
          multiplier: scored.multiplier,
          from,
        };
  appendEvent(state, events, publicVisibility, payload);
  appendEvent(state, events, publicVisibility, {
    type: EVENT_TYPES.settled,
    scoreDeltas: result.scoreDeltas,
  });
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.gameEnded, result });
};

export const finishRonWins = (
  state: JunkState,
  events: GameEvent<JunkEventPayload>[],
  winners: SeatId[],
  from: SeatId,
  tile: TileId,
): void => {
  const scoredWinners = winners.map((winner) => {
    const concealedTiles = sortTileIdsForDisplay([...state.seats[winner]!.hand, tile]);
    const { family, groups: rawGroups } = decomposeJunkWin(state, winner, concealedTiles);
    const groups = sortWinningGroupsForDisplay(rawGroups);
    const scored = scoreJunkHand({
      family,
      groups,
      melds: state.seats[winner]!.melds.map((meld) => ({
        type: meld.type,
        tiles: meld.tiles.map((meldTile) => STANDARD_TILE_SET.kindOf(meldTile)),
      })),
      win: { by: "ron" },
      gangChainLength: state.gangChain[winner],
    });
    return { winner, concealedTiles, groups, scored };
  });
  const result = settleWins(
    state,
    scoredWinners.map(({ winner, scored }) => ({
      seat: winner,
      fanTypes: scored.fanTypes,
      multiplier: scored.multiplier,
    })),
    "ron",
    from,
  );
  state.phase = "finished";
  state.result = result;
  for (const { winner, concealedTiles, groups, scored } of scoredWinners) {
    state.wins = { ...state.wins, [winner]: { hand: concealedTiles, winTile: tile, groups } };
    appendEvent(state, events, publicVisibility, {
      type: EVENT_TYPES.huDeclared,
      seat: winner,
      winType: "ron",
      hand: concealedTiles,
      winTile: tile,
      groups,
      fanTypes: scored.fanTypes,
      multiplier: scored.multiplier,
      from,
    });
  }
  appendEvent(state, events, publicVisibility, {
    type: EVENT_TYPES.settled,
    scoreDeltas: result.scoreDeltas,
  });
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.gameEnded, result });
};

export const resolveUnclaimed = (state: JunkState, events: GameEvent<JunkEventPayload>[]): void => {
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
    delete state.justDrawn;
    incrementGangChain(state.gangChain, seat);
    appendEvent(state, events, publicVisibility, {
      type: EVENT_TYPES.claimWindowResolved,
      result: "unclaimed",
      seat,
    });
    appendEvent(state, events, publicVisibility, {
      type: EVENT_TYPES.gangMade,
      seat,
      gangType: "buGang",
      tiles: [...meld.tiles],
    });
    beginTurn(state, events, seat, true, true);
    return;
  }
  const discardedBy = state.pendingClaims!.discard.seat;
  delete state.pendingClaims;
  const next = nextSeat(discardedBy);
  appendEvent(state, events, publicVisibility, {
    type: EVENT_TYPES.claimWindowResolved,
    result: "unclaimed",
    seat: next,
  });
  beginTurn(state, events, next, true);
};

export const applyDiscard = (
  state: JunkState,
  seat: SeatId,
  tile: TileId,
  events: GameEvent<JunkEventPayload>[],
): JunkApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  const hand = state.seats[seat]!.hand;
  const remaining = removeTiles(hand, [tile]);
  if (!remaining) return fail("TILE_NOT_IN_HAND");
  state.seats[seat]!.hand = remaining;
  state.seats[seat]!.discards.push({ tile });
  state.lastDiscard = { seat, tile };
  delete state.justDrawn;
  // A discard always breaks this seat's consecutive-gang chain (junk.md §3/§6).
  resetGangChain(state.gangChain, seat);
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.tileDiscarded, seat, tile });
  const options: JunkPendingClaims = {
    discard: { seat, tile },
    options: {},
    responses: {},
  };
  state.pendingClaims = options;
  for (const candidate of SEAT_IDS) {
    const candidateOptions = claimOptions(state, candidate);
    if (candidateOptions.length === 0) continue;
    options.options[candidate] = candidateOptions;
    appendEvent(state, events, seatVisibility(candidate), {
      type: EVENT_TYPES.claimWindowOpened,
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
  events: GameEvent<JunkEventPayload>[],
): JunkApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  const tiles = sameKind(state.seats[seat]!.hand, kind).slice(0, 4);
  if (tiles.length !== 4) return fail("GANG_NOT_AVAILABLE");
  state.seats[seat]!.hand = removeTiles(state.seats[seat]!.hand, tiles)!;
  state.seats[seat]!.melds.push({ type: "anGang", tiles });
  delete state.justDrawn;
  incrementGangChain(state.gangChain, seat);
  appendEvent(state, events, publicVisibility, {
    type: EVENT_TYPES.gangMade,
    seat,
    gangType: "anGang",
  });
  appendEvent(state, events, seatVisibility(seat), {
    type: EVENT_TYPES.gangMade,
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
  events: GameEvent<JunkEventPayload>[],
): JunkApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  if (!state.seats[seat]!.hand.includes(tile)) return fail("TILE_NOT_IN_HAND");
  const kind = STANDARD_TILE_SET.kindOf(tile);
  const meld = state.seats[seat]!.melds.find(
    (candidate) =>
      candidate.type === "peng" && STANDARD_TILE_SET.kindOf(candidate.tiles[0]!) === kind,
  );
  if (!meld) return fail("GANG_NOT_AVAILABLE");
  state.pendingClaims = {
    discard: { seat, tile },
    source: "robKong",
    options: {},
    responses: {},
  };
  for (const candidate of SEAT_IDS) {
    const candidateOptions = claimOptions(state, candidate);
    if (candidateOptions.length === 0) continue;
    state.pendingClaims.options[candidate] = candidateOptions;
    appendEvent(state, events, seatVisibility(candidate), {
      type: EVENT_TYPES.claimWindowOpened,
      options: candidateOptions,
    });
  }
  if (Object.keys(state.pendingClaims.options).length > 0) {
    state.phase = "awaiting-claims";
    return { state, events };
  }
  resolveUnclaimed(state, events);
  return { state, events };
};

export const createJunkGame = (
  seed: number,
  dealer: SeatId,
  config: unknown = {},
): JunkApplyResult => {
  const parsed = parseJunkConfig(config);
  if ("error" in parsed) return parsed;
  const shuffled = createWall(createPrng(seed));
  const state: JunkState = {
    config: parsed.config,
    phase: "dealing",
    wall: shuffled.wall,
    seats: seats(),
    currentSeat: dealer,
    dealer,
    gangChain: createGangChain(),
    seq: 0,
    prng: shuffled.prng,
  };
  const events: GameEvent<JunkEventPayload>[] = [];
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
  const dealerHand = state.seats[dealer]!.hand;
  state.justDrawn = { seat: dealer, tile: dealerHand[dealerHand.length - 1]! };
  state.phase = "playing";
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.turnStarted, seat: dealer });
  assertTileConservation(state);
  return { state, events };
};

// docs/variants/junk.md §4「庄家轮换公式」：胡牌者坐下一局庄（不论是否为原庄家）；
// 流局则轮转到当前庄家的逆时针下一位。
export const computeNextJunkDealer = (finished: JunkState, currentDealer: SeatId): SeatId => {
  const result = finished.result;
  if (result?.type === "win") return result.winner;
  return nextSeat(currentDealer);
};
