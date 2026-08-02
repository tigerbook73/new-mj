import { assertTileConservation } from "../../lib/invariants.ts";
import { createEvent, nextEventSeq, type GameEvent } from "../../events.ts";
import { createPrng } from "../../lib/prng.ts";
import { SEAT_IDS, nextSeat } from "../../lib/seats.ts";
import { STANDARD_TILE_SET } from "../../lib/tiles.ts";
import { createWall, drawFromHead, drawFromTail } from "../../lib/wall.ts";
import type { SeatId, TileId, TileKind } from "../../lib/ids.ts";
import type { SeatState } from "../../lib/seat-state.ts";
import { CAISHEN_KIND } from "./constants.ts";
import { DEFAULT_HANGZHOU_CONFIG, parseHangzhouConfig } from "./config.ts";
import { HANGZHOU_EVENT_TYPES as EVENT_TYPES } from "./events.ts";
import { decomposeWinningShape, isBaotou, isWinningHand } from "./hand.ts";
import { scoreHangzhouHand, type HangzhouScoringInput } from "./scoring.ts";
import type {
  HangzhouApplyResult,
  HangzhouClaimOption,
  HangzhouConfig,
  HangzhouEventPayload,
  HangzhouGameResult,
  HangzhouPendingClaims,
  HangzhouState,
  HangzhouWinDetail,
} from "./types.ts";

export const seats = (): SeatState[] => SEAT_IDS.map(() => ({ hand: [], melds: [], discards: [] }));

export const cloneState = (state: HangzhouState): HangzhouState => {
  const cloned: HangzhouState = {
    ...state,
    wall: [...state.wall],
    seats: state.seats.map((seat) => ({
      hand: [...seat.hand],
      melds: seat.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
      discards: seat.discards.map((discard) => ({ ...discard })),
    })),
    caiPiaoCount: [...state.caiPiaoCount] as HangzhouState["caiPiaoCount"],
    gangChain: [...state.gangChain] as HangzhouState["gangChain"],
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
  state: HangzhouState,
  events: GameEvent<HangzhouEventPayload>[],
  visibility: GameEvent["visibility"],
  payload: HangzhouEventPayload,
): void => {
  state.seq = nextEventSeq(state.seq);
  events.push(createEvent(state.seq, visibility, payload));
};

export const fail = (code: string): HangzhouApplyResult => ({ error: { code } });

export const configOf = (state: HangzhouState): HangzhouConfig => ({
  ...DEFAULT_HANGZHOU_CONFIG,
  ...state.config,
  rulesetId: "hangzhou",
});

export const kindsOf = (tiles: readonly TileId[]): TileKind[] =>
  tiles.map((tile) => STANDARD_TILE_SET.kindOf(tile));

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

export const winningTiles = (state: HangzhouState, seat: SeatId, extra?: TileId): TileId[] => {
  const own = state.seats[seat] as SeatState;
  const tiles = extra === undefined ? own.hand : [...own.hand, extra];
  return [...tiles, ...own.melds.flatMap((meld) => meld.tiles)];
};

/** Concealed-hand shape check only; open melds (never containing caishen)
 * only count toward `meldsNeeded`, see hand.ts and hangzhou.md §2/§6. */
export const isWin = (state: HangzhouState, seat: SeatId, extra?: TileId): boolean => {
  const own = state.seats[seat] as SeatState;
  const concealed = extra === undefined ? own.hand : [...own.hand, extra];
  return isWinningHand(kindsOf(concealed), own.melds.length);
};

/**
 * Zimo (self-draw win) requires having actually just drawn — a hand can
 * coincidentally already satisfy isWin() right after claiming a chi/peng
 * (whose 2 concealed tiles happen to leave the rest already complete),
 * which is not a self-draw and must not offer `zimo`. `justDrawn` is only
 * set by an actual draw (or the dealer's opening 14th tile, see
 * createHangzhouGame) and is cleared by discard/chi/peng/gang, so checking
 * it here is sufficient — no separate "did this seat just claim" flag needed.
 */
export const canZimo = (state: HangzhouState, seat: SeatId): boolean =>
  state.justDrawn?.seat === seat && isWin(state, seat);

export const chiOptions = (
  state: HangzhouState,
  seat: SeatId,
  discarded: TileId,
): HangzhouClaimOption[] => {
  const kind = STANDARD_TILE_SET.kindOf(discarded);
  if (kind.endsWith("z")) return [];
  const rank = tileRank(discarded);
  const suit = tileSuit(discarded);
  const hand = state.seats[seat]!.hand;
  const options: HangzhouClaimOption[] = [];
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

/** docs/variants/hangzhou.md §2/§3: caishen can never be chi'd/peng'd/gang'd,
 * whether it's the discarded tile or a matching tile sitting in hand. */
export const claimOptions = (state: HangzhouState, seat: SeatId): HangzhouClaimOption[] => {
  const pending = state.pendingClaims;
  if (!pending || pending.discard.seat === seat) return [];
  const tile = pending.discard.tile;
  const kind = STANDARD_TILE_SET.kindOf(tile);
  const options: HangzhouClaimOption[] = [];
  // 三牢 (hangzhou.md §5): ron is blocked for the dealer's first two
  // consecutive terms; self-draw (zimo) is never affected by this gate.
  if (isWin(state, seat, tile) && configOf(state).dealerStreak >= 3) {
    options.push({ action: { type: "hu" } });
  }
  if (kind === CAISHEN_KIND) return options;
  const hand = state.seats[seat]!.hand;
  const matching = sameKind(hand, kind);
  if (matching.length >= 3) options.push({ action: { type: "minGang" } });
  if (matching.length >= 2) options.push({ action: { type: "peng" } });
  if (seat === nextSeat(pending.discard.seat)) options.push(...chiOptions(state, seat, tile));
  return options;
};

export const emitDraw = (
  state: HangzhouState,
  events: GameEvent<HangzhouEventPayload>[],
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

export const beginTurn = (
  state: HangzhouState,
  events: GameEvent<HangzhouEventPayload>[],
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

export const applyDrawAction = (
  state: HangzhouState,
  seat: SeatId,
  events: GameEvent<HangzhouEventPayload>[],
): HangzhouApplyResult => {
  if (state.phase !== "awaiting-draw" || state.currentSeat !== seat || !state.pendingDraw)
    return fail("DRAW_NOT_AVAILABLE");
  const { replacement } = state.pendingDraw;
  delete state.pendingDraw;
  emitDraw(state, events, seat, replacement);
  state.phase = "playing";
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.turnStarted, seat });
  return { state, events };
};

const buildScoringInput = (
  state: HangzhouState,
  seat: SeatId,
  winTile: TileId,
  by: "zimo" | "ron",
  excludeFromHand: boolean,
): HangzhouScoringInput => {
  const own = state.seats[seat]!;
  const handTiles = excludeFromHand ? removeTiles(own.hand, [winTile])! : own.hand;
  return {
    hand: kindsOf(handTiles),
    melds: own.melds.map((meld) => ({ type: meld.type, tiles: kindsOf(meld.tiles) })),
    win: { tile: STANDARD_TILE_SET.kindOf(winTile), by },
    caiPiaoCount: state.caiPiaoCount[seat],
    gangChainLength: by === "zimo" ? state.gangChain[seat] : 0,
    baseScore: configOf(state).baseScore,
  };
};

export const finishWin = (
  state: HangzhouState,
  events: GameEvent<HangzhouEventPayload>[],
  winner: SeatId,
): void => {
  const own = state.seats[winner]!;
  const winTile =
    state.justDrawn?.seat === winner
      ? state.justDrawn.tile
      : (own.hand[own.hand.length - 1] as TileId);
  const scored = scoreHangzhouHand(buildScoringInput(state, winner, winTile, "zimo", true));
  // isWin() already gated the `zimo` action, so this must succeed; the branch
  // exists only to satisfy the discriminated union without an unsafe cast.
  const winDetail: HangzhouWinDetail = scored.hu
    ? {
        seat: winner,
        fanTypes: scored.fanTypes,
        multiplier: scored.multiplier,
        payout: scored.payout,
      }
    : { seat: winner, fanTypes: [], multiplier: 0, payout: 0 };
  const scoreDeltas: [number, number, number, number] = [0, 0, 0, 0];
  for (const seat of SEAT_IDS) {
    if (seat === winner) continue;
    scoreDeltas[seat] -= winDetail.payout;
    scoreDeltas[winner] += winDetail.payout;
  }
  const result: HangzhouGameResult = {
    type: "win",
    winner,
    winners: [winDetail],
    winType: "zimo",
    scoreDeltas,
  };
  state.phase = "finished";
  state.result = result;
  // isWin() already gated the zimo action, so this must find a decomposition;
  // the fallback exists only to satisfy the type without an unsafe cast.
  const groups = decomposeWinningShape(kindsOf(own.hand), own.melds.length) ?? [];
  state.wins = { ...state.wins, [winner]: { hand: [...own.hand], winTile, groups } };
  appendEvent(state, events, publicVisibility, {
    type: EVENT_TYPES.huDeclared,
    seat: winner,
    winType: "zimo",
    hand: [...own.hand],
    winTile,
    groups,
    fanTypes: winDetail.fanTypes,
    multiplier: winDetail.multiplier,
  });
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.settled, scoreDeltas });
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.gameEnded, result });
};

export const finishRonWins = (
  state: HangzhouState,
  events: GameEvent<HangzhouEventPayload>[],
  winners: SeatId[],
  from: SeatId,
  tile: TileId,
): void => {
  const scoreDeltas: [number, number, number, number] = [0, 0, 0, 0];
  const winDetails: HangzhouWinDetail[] = [];
  for (const winner of winners) {
    const scored = scoreHangzhouHand(buildScoringInput(state, winner, tile, "ron", false));
    if (!scored.hu) continue; // unreachable: claimOptions() already gated this via isWin()
    winDetails.push({
      seat: winner,
      fanTypes: scored.fanTypes,
      multiplier: scored.multiplier,
      payout: scored.payout,
    });
    scoreDeltas[from] -= scored.payout;
    scoreDeltas[winner] += scored.payout;
  }
  const result: HangzhouGameResult = {
    type: "win",
    winner: winners[0]!,
    winners: winDetails,
    winType: "ron",
    from,
    scoreDeltas,
  };
  state.phase = "finished";
  state.result = result;
  for (const detail of winDetails) {
    const concealedTiles = [...state.seats[detail.seat]!.hand, tile];
    // claimOptions() already gated this via isWin(), so this must find a
    // decomposition; the fallback exists only to satisfy the type.
    const groups =
      decomposeWinningShape(kindsOf(concealedTiles), state.seats[detail.seat]!.melds.length) ?? [];
    state.wins = { ...state.wins, [detail.seat]: { hand: concealedTiles, winTile: tile, groups } };
    appendEvent(state, events, publicVisibility, {
      type: EVENT_TYPES.huDeclared,
      seat: detail.seat,
      winType: "ron",
      hand: concealedTiles,
      winTile: tile,
      groups,
      from,
      fanTypes: detail.fanTypes,
      multiplier: detail.multiplier,
    });
  }
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.settled, scoreDeltas });
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.gameEnded, result });
};

export const resolveUnclaimed = (
  state: HangzhouState,
  events: GameEvent<HangzhouEventPayload>[],
): void => {
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
  state: HangzhouState,
  seat: SeatId,
  tile: TileId,
  events: GameEvent<HangzhouEventPayload>[],
): HangzhouApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  const hand = state.seats[seat]!.hand;
  const remaining = removeTiles(hand, [tile]);
  if (!remaining) return fail("TILE_NOT_IN_HAND");

  // docs/variants/hangzhou.md §4: caiPiaoCount accumulates whenever a
  // baotou hand discards caishen and stays baotou afterwards.
  const meldsCount = state.seats[seat]!.melds.length;
  const justDrawnTile = state.justDrawn?.seat === seat ? state.justDrawn.tile : undefined;
  const beforeHand = justDrawnTile !== undefined ? removeTiles(hand, [justDrawnTile])! : hand;
  const wasBaotouBefore = isBaotou(kindsOf(beforeHand), meldsCount);
  const discardedIsCaishen = STANDARD_TILE_SET.kindOf(tile) === CAISHEN_KIND;
  if (wasBaotouBefore && discardedIsCaishen && isBaotou(kindsOf(remaining), meldsCount)) {
    state.caiPiaoCount[seat] += 1;
  }

  state.seats[seat]!.hand = remaining;
  state.seats[seat]!.discards.push({ tile });
  state.lastDiscard = { seat, tile };
  delete state.justDrawn;
  // A discard always breaks this seat's consecutive-gang chain (hangzhou.md §6).
  state.gangChain[seat] = 0;
  appendEvent(state, events, publicVisibility, { type: EVENT_TYPES.tileDiscarded, seat, tile });
  const pending: HangzhouPendingClaims = { discard: { seat, tile }, options: {}, responses: {} };
  state.pendingClaims = pending;
  for (const candidate of SEAT_IDS) {
    const candidateOptions = claimOptions(state, candidate);
    if (candidateOptions.length === 0) continue;
    pending.options[candidate] = candidateOptions;
    appendEvent(state, events, seatVisibility(candidate), {
      type: EVENT_TYPES.claimWindowOpened,
      options: candidateOptions,
    });
  }
  if (Object.keys(pending.options).length === 0) {
    resolveUnclaimed(state, events);
  } else {
    state.phase = "awaiting-claims";
  }
  return { state, events };
};

export const applyAnGang = (
  state: HangzhouState,
  seat: SeatId,
  kind: TileKind,
  events: GameEvent<HangzhouEventPayload>[],
): HangzhouApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  if (kind === CAISHEN_KIND) return fail("GANG_NOT_AVAILABLE");
  const tiles = sameKind(state.seats[seat]!.hand, kind).slice(0, 4);
  if (tiles.length !== 4) return fail("GANG_NOT_AVAILABLE");
  state.seats[seat]!.hand = removeTiles(state.seats[seat]!.hand, tiles)!;
  state.seats[seat]!.melds.push({ type: "anGang", tiles });
  delete state.justDrawn;
  state.gangChain[seat] += 1;
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
  state: HangzhouState,
  seat: SeatId,
  tile: TileId,
  events: GameEvent<HangzhouEventPayload>[],
): HangzhouApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  if (!state.seats[seat]!.hand.includes(tile)) return fail("TILE_NOT_IN_HAND");
  const kind = STANDARD_TILE_SET.kindOf(tile);
  const meld = state.seats[seat]!.melds.find(
    (candidate) =>
      candidate.type === "peng" && STANDARD_TILE_SET.kindOf(candidate.tiles[0]!) === kind,
  );
  if (!meld) return fail("GANG_NOT_AVAILABLE");
  state.seats[seat]!.hand = removeTiles(state.seats[seat]!.hand, [tile])!;
  meld.type = "buGang";
  meld.tiles.push(tile);
  delete state.justDrawn;
  state.gangChain[seat] += 1;
  appendEvent(state, events, publicVisibility, {
    type: EVENT_TYPES.gangMade,
    seat,
    gangType: "buGang",
    tiles: [...meld.tiles],
  });
  beginTurn(state, events, seat, true, true);
  return { state, events };
};

export const createHangzhouGame = (
  seed: number,
  dealer: SeatId,
  config: unknown = {},
): HangzhouApplyResult => {
  const parsed = parseHangzhouConfig(config);
  if ("error" in parsed) return parsed;
  const shuffled = createWall(createPrng(seed));
  const state: HangzhouState = {
    config: parsed.config,
    phase: "dealing",
    wall: shuffled.wall,
    seats: seats(),
    currentSeat: dealer,
    seq: 0,
    prng: shuffled.prng,
    caiPiaoCount: [0, 0, 0, 0],
    gangChain: [0, 0, 0, 0],
  };
  const events: GameEvent<HangzhouEventPayload>[] = [];
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

// docs/variants/hangzhou.md §8: the dealer continues (连庄) if the dealer won
// (zimo or ron, alone or among multiple ron winners) or the game drew;
// otherwise (someone else won) the dealer rotates clockwise. The room layer
// separately tracks how many consecutive terms this produces and feeds it
// back as `dealerStreak` on the next game's config (see §5/§8, session-mechanics.md).
export const computeNextHangzhouDealer = (
  finished: HangzhouState,
  currentDealer: SeatId,
): SeatId => {
  const result = finished.result;
  if (!result || result.type === "draw") return currentDealer;
  const dealerWon = result.winners.some((detail) => detail.seat === currentDealer);
  return dealerWon ? currentDealer : nextSeat(currentDealer);
};
