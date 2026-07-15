import { assertTileConservation } from "@/lib/invariants.ts";
import { createEvent, EVENT_TYPES, nextEventSeq, type GameEvent } from "@/events.ts";
import type { SeatId, TileId } from "@/lib/ids.ts";
import { type Meld, type SeatState } from "@/lib/seat.ts";
import { applyChooseLack, applyExchangeThree, createBloodbattlePrelude } from "./prelude.ts";
import { scoreBloodbattleHand } from "./scoring.ts";
import type { BloodbattleAction, BloodbattleApplyResult, BloodbattleState } from "./types.ts";
import { BLOODBATTLE_SEATS, BLOODBATTLE_TILE_SET } from "./constants.ts";

const seats = BLOODBATTLE_SEATS;
const fail = (code: string): BloodbattleApplyResult => ({ error: { code } });
const cloneState = (state: BloodbattleState): BloodbattleState => ({
  ...state,
  wall: [...state.wall],
  scores: [...state.scores] as BloodbattleState["scores"],
  status: [...state.status] as BloodbattleState["status"],
  gangPayments: state.gangPayments.map((payment) => ({ ...payment })),
  seats: state.seats.map((seat) => ({
    hand: [...seat.hand],
    melds: seat.melds.map((m) => ({ ...m, tiles: [...m.tiles] })),
    discards: seat.discards.map((d) => ({ ...d })),
  })),
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
const append = (
  state: BloodbattleState,
  events: GameEvent[],
  visibility: GameEvent["visibility"],
  payload: unknown,
): void => {
  state.seq = nextEventSeq(state.seq);
  events.push(createEvent(state.seq, visibility, payload));
};
const kind = (tile: TileId) => BLOODBATTLE_TILE_SET.kindOf(tile);
const sameKind = (hand: readonly TileId[], tile: TileId) =>
  hand.filter((candidate) => kind(candidate) === kind(tile));
const sameKindValue = (hand: readonly TileId[], tileKind: string) =>
  hand.filter((candidate) => kind(candidate) === tileKind);
const remove = (hand: readonly TileId[], tile: TileId): TileId[] => {
  const copy = [...hand];
  const i = copy.indexOf(tile);
  if (i < 0) throw new Error("TILE_NOT_IN_HAND");
  copy.splice(i, 1);
  return copy;
};
const nextActive = (state: BloodbattleState, seat: SeatId): SeatId | undefined => {
  for (let i = 1; i <= 4; i += 1) {
    const candidate = ((seat + i) % 4) as SeatId;
    if (state.status[candidate] === "active") return candidate;
  }
  return undefined;
};
export const scoreFor = (
  state: BloodbattleState,
  seat: SeatId,
  winTile: TileId,
  by: "zimo" | "discard" | "robKong",
) => {
  const own = state.seats[seat]!;
  const hand = [...own.hand];
  if (by === "zimo") hand.splice(hand.indexOf(winTile), 1);
  return scoreBloodbattleHand({
    config: { capFan: state.config.capFan, selfDrawBonus: state.config.selfDrawBonus },
    hand: hand.map(kind),
    melds: own.melds.map((meld) => ({
      type: meld.type === "chi" ? "peng" : meld.type,
      tiles: meld.tiles.map(kind),
    })),
    lack: state.lack?.[seat]!,
    win: { tile: kind(winTile), by },
  });
};
export const isWin = (state: BloodbattleState, seat: SeatId, tile?: TileId): boolean => {
  const hand = state.seats[seat]!.hand;
  if (tile === undefined) return scoreFor(state, seat, hand[hand.length - 1]!, "zimo").hu;
  return scoreFor(state, seat, tile, "discard").hu;
};
const extraTiles = (state: BloodbattleState): readonly TileId[] =>
  Object.values(state.wins ?? {}).flatMap((win) => win!.hand);

export const createBloodbattleGame = (seed: number, config?: unknown): BloodbattleApplyResult =>
  createBloodbattlePrelude(seed, config);

export const applyDiscard = (
  state: BloodbattleState,
  seat: SeatId,
  tile: TileId,
  events: GameEvent[],
): BloodbattleApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("DISCARD_NOT_AVAILABLE");
  if (state.lack?.[seat] !== undefined && kind(tile)[1] !== state.lack[seat])
    return fail("MUST_DISCARD_LACK");
  if (!state.seats[seat]!.hand.includes(tile)) return fail("TILE_NOT_IN_HAND");
  state.seats[seat]!.hand = remove(state.seats[seat]!.hand, tile);
  state.seats[seat]!.discards.push({ tile });
  state.lastDiscard = { seat, tile };
  const options: NonNullable<BloodbattleState["pendingClaims"]>["options"] = {};
  for (const candidate of seats) {
    if (candidate === seat || state.status[candidate] !== "active") continue;
    const candidateOptions = [];
    if (
      sameKind(state.seats[candidate]!.hand, tile).length >= 2 &&
      kind(tile)[1] !== state.lack?.[candidate]
    )
      candidateOptions.push({ action: { type: "peng" as const } });
    if (
      sameKind(state.seats[candidate]!.hand, tile).length >= 3 &&
      kind(tile)[1] !== state.lack?.[candidate]
    )
      candidateOptions.push({ action: { type: "minGang" as const } });
    if (isWin(state, candidate, tile)) candidateOptions.push({ action: { type: "hu" as const } });
    if (candidateOptions.length) options[candidate] = candidateOptions;
  }
  append(state, events, { type: "public" }, { type: EVENT_TYPES.tileDiscarded, seat, tile });
  if (Object.keys(options).length === 0) {
    delete state.lastGangEventId;
    return drawNext(state, events, seat);
  }
  state.phase = "awaiting-claims";
  state.pendingClaims = { discard: { seat, tile }, options, responses: {} };
  append(
    state,
    events,
    { type: "public" },
    { type: EVENT_TYPES.claimWindowOpened, seat, tile, options },
  );
  return { state, events };
};
const drawNext = (
  state: BloodbattleState,
  events: GameEvent[],
  from: SeatId,
): BloodbattleApplyResult => {
  const seat = nextActive(state, from);
  if (seat === undefined || state.wall.length === 0) {
    state.phase = "finished";
    state.result = {
      winners: seats.filter((s) => state.status[s] === "won"),
      endReason: "wallExhausted",
    };
    append(state, events, { type: "public" }, { type: EVENT_TYPES.wallExhausted });
    return { state, events };
  }
  const tile = state.wall.shift()!;
  state.seats[seat]!.hand.push(tile);
  state.currentSeat = seat;
  state.phase = "playing";
  append(state, events, { type: "public" }, { type: EVENT_TYPES.tileDrawn, seat });
  append(
    state,
    events,
    { type: "seat", seats: [seat] },
    { type: EVENT_TYPES.tileDrawnPrivate, seat, tile },
  );
  append(state, events, { type: "public" }, { type: EVENT_TYPES.turnStarted, seat });
  return { state, events };
};
const drawReplacement = (state: BloodbattleState, events: GameEvent[], seat: SeatId): void => {
  if (state.wall.length === 0) {
    state.phase = "finished";
    state.result = {
      winners: seats.filter((s) => state.status[s] === "won"),
      endReason: "wallExhausted",
    };
    append(state, events, { type: "public" }, { type: EVENT_TYPES.wallExhausted });
    return;
  }
  const tile = state.wall.shift()!;
  state.seats[seat]!.hand.push(tile);
  state.currentSeat = seat;
  state.phase = "playing";
  append(state, events, { type: "public" }, { type: EVENT_TYPES.gangReplacementDrawn, seat });
  append(
    state,
    events,
    { type: "seat", seats: [seat] },
    { type: EVENT_TYPES.tileDrawnPrivate, seat, tile },
  );
  append(state, events, { type: "public" }, { type: EVENT_TYPES.turnStarted, seat });
};
const settleGang = (
  state: BloodbattleState,
  events: GameEvent[],
  opener: SeatId,
  amount: number,
  onlyPayers?: readonly SeatId[],
): void => {
  const gangEventId = state.seq + 1;
  for (const payer of seats) {
    if (
      payer === opener ||
      state.status[payer] !== "active" ||
      (onlyPayers !== undefined && !onlyPayers.includes(payer))
    )
      continue;
    state.scores[opener] += amount;
    state.scores[payer] -= amount;
    state.gangPayments.push({ gangEventId, opener, payer, amount });
  }
  state.lastGangEventId = gangEventId;
  append(
    state,
    events,
    { type: "public" },
    {
      type: EVENT_TYPES.settled,
      reason: "gang",
      scoreDeltas: state.scores.map((_, index) => {
        const payers = seats.filter(
          (payer) =>
            payer !== opener &&
            state.status[payer] === "active" &&
            (onlyPayers === undefined || onlyPayers.includes(payer)),
        );
        return index === opener
          ? amount * payers.length
          : payers.includes(index as SeatId)
            ? -amount
            : 0;
      }) as [number, number, number, number],
    },
  );
};
const transferGangPayments = (
  state: BloodbattleState,
  events: GameEvent[],
  opener: SeatId,
  winner: SeatId,
): void => {
  const gangEventId = state.lastGangEventId;
  if (gangEventId === undefined) return;
  const scoreDeltas = [0, 0, 0, 0] as [number, number, number, number];
  for (const payment of state.gangPayments) {
    if (payment.gangEventId !== gangEventId || payment.opener !== opener || payment.transferred)
      continue;
    state.scores[opener] -= payment.amount;
    state.scores[winner] += payment.amount;
    scoreDeltas[opener] -= payment.amount;
    scoreDeltas[winner] += payment.amount;
    payment.transferred = true;
  }
  if (scoreDeltas.some((delta) => delta !== 0))
    append(
      state,
      events,
      { type: "public" },
      { type: EVENT_TYPES.settled, reason: "gangTransfer", scoreDeltas },
    );
  delete state.lastGangEventId;
};
const applyAnGang = (
  state: BloodbattleState,
  seat: SeatId,
  gangKind: string,
  events: GameEvent[],
): BloodbattleApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("GANG_NOT_AVAILABLE");
  const tiles = state.seats[seat]!.hand.filter((tile) => kind(tile) === gangKind);
  if (tiles.length !== 4 || tiles.some((tile) => kind(tile)[1] !== state.lack?.[seat]))
    return fail("GANG_NOT_AVAILABLE");
  state.seats[seat]!.hand = state.seats[seat]!.hand.filter((tile) => !tiles.includes(tile));
  state.seats[seat]!.melds.push({ type: "anGang", tiles });
  append(
    state,
    events,
    { type: "public" },
    { type: EVENT_TYPES.gangMade, seat, gangType: "anGang" },
  );
  settleGang(state, events, seat, 2);
  drawReplacement(state, events, seat);
  return { state, events };
};
const completeBuGang = (
  state: BloodbattleState,
  seat: SeatId,
  tile: TileId,
  events: GameEvent[],
): BloodbattleApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("GANG_NOT_AVAILABLE");
  if (kind(tile)[1] !== state.lack?.[seat]) return fail("GANG_NOT_AVAILABLE");
  const peng = state.seats[seat]!.melds.find(
    (meld) => meld.type === "peng" && kind(meld.tiles[0]!) === kind(tile),
  );
  if (!peng || !state.seats[seat]!.hand.includes(tile)) return fail("GANG_NOT_AVAILABLE");
  state.seats[seat]!.hand = remove(state.seats[seat]!.hand, tile);
  peng.type = "buGang";
  peng.tiles.push(tile);
  append(
    state,
    events,
    { type: "public" },
    { type: EVENT_TYPES.gangMade, seat, gangType: "buGang" },
  );
  settleGang(state, events, seat, 1);
  drawReplacement(state, events, seat);
  return { state, events };
};
const applyBuGang = (
  state: BloodbattleState,
  seat: SeatId,
  tile: TileId,
  events: GameEvent[],
): BloodbattleApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("GANG_NOT_AVAILABLE");
  if (kind(tile)[1] !== state.lack?.[seat]) return fail("GANG_NOT_AVAILABLE");
  const peng = state.seats[seat]!.melds.find(
    (meld) => meld.type === "peng" && kind(meld.tiles[0]!) === kind(tile),
  );
  if (!peng || !state.seats[seat]!.hand.includes(tile)) return fail("GANG_NOT_AVAILABLE");
  if (state.config.robKong) {
    const options: NonNullable<BloodbattleState["pendingClaims"]>["options"] = {};
    for (const candidate of seats) {
      if (
        candidate !== seat &&
        state.status[candidate] === "active" &&
        isWin(state, candidate, tile)
      )
        options[candidate] = [{ action: { type: "hu" } }];
    }
    if (Object.keys(options).length > 0) {
      state.phase = "awaiting-claims";
      state.pendingClaims = { discard: { seat, tile }, source: "robKong", options, responses: {} };
      append(
        state,
        events,
        { type: "public" },
        { type: EVENT_TYPES.claimWindowOpened, source: "robKong", seat, tile, options },
      );
      return { state, events };
    }
  }
  return completeBuGang(state, seat, tile, events);
};
export const finishWin = (
  state: BloodbattleState,
  events: GameEvent[],
  winner: SeatId,
  winTile: TileId,
  by: "zimo" | "discard" | "robKong",
  from?: SeatId,
): void => {
  const scored = scoreFor(state, winner, winTile, by);
  if (!scored.hu) throw new Error("WIN_NOT_AVAILABLE");
  const hand = [...state.seats[winner]!.hand];
  if (by === "zimo") state.seats[winner]!.hand = remove(state.seats[winner]!.hand, winTile);
  else state.seats[winner]!.hand = [];
  state.status[winner] = "won";
  state.wins = state.wins ?? {};
  state.wins[winner] = { hand, winTile, lack: state.lack![winner]! };
  state.scores[winner] += scored.multiplier;
  append(
    state,
    events,
    { type: "public" },
    {
      type: EVENT_TYPES.huDeclared,
      seat: winner,
      winType: by === "zimo" ? "zimo" : by === "robKong" ? "robKong" : "ron",
      from,
      snapshot: state.wins[winner],
      scoring: scored,
      activeSeats: seats.filter((s) => state.status[s] === "active"),
    },
  );
  if (state.status.filter((status) => status === "won").length >= 3) {
    state.phase = "finished";
    state.result = { winners: seats.filter((s) => state.status[s] === "won"), endReason: "allWin" };
    append(
      state,
      events,
      { type: "public" },
      { type: EVENT_TYPES.gameEnded, result: state.result },
    );
  }
};
export const resolveClaims = (
  state: BloodbattleState,
  events: GameEvent[],
): BloodbattleApplyResult => {
  const pending = state.pendingClaims!;
  const responses = pending.responses;
  const hu = seats.filter((s) => responses[s]?.type === "hu");
  const winners = state.config.multiWinOnDiscard ? hu : hu.slice(0, 1);
  if (pending.source === "robKong") {
    if (winners.length) {
      for (const winner of winners)
        finishWin(state, events, winner, pending.discard.tile, "robKong", pending.discard.seat);
      delete state.lastGangEventId;
      delete state.pendingClaims;
      return { state, events };
    }
    delete state.lastGangEventId;
    delete state.pendingClaims;
    return completeBuGang(state, pending.discard.seat, pending.discard.tile, events);
  }
  if (winners.length) {
    const tile = pending.discard.tile;
    transferGangPayments(state, events, pending.discard.seat, winners[0]!);
    for (const winner of winners)
      finishWin(state, events, winner, tile, "discard", pending.discard.seat);
    delete state.pendingClaims;
    if (state.phase !== "finished") return drawNext(state, events, pending.discard.seat);
    return { state, events };
  }
  delete state.lastGangEventId;
  const peng = seats.find((s) => responses[s]?.type === "peng");
  const minGang = seats.find((s) => responses[s]?.type === "minGang");
  if (minGang !== undefined) {
    const tile = pending.discard.tile;
    const matching = sameKind(state.seats[minGang]!.hand, tile);
    state.seats[minGang]!.hand = matching
      .slice(0, 3)
      .reduce((hand, candidate) => remove(hand, candidate), state.seats[minGang]!.hand);
    state.seats[minGang]!.melds.push({
      type: "minGang",
      tiles: [matching[0]!, matching[1]!, matching[2]!, tile],
      from: pending.discard.seat,
    });
    const discard = state.seats[pending.discard.seat]!.discards.at(-1);
    if (discard) discard.claimedBy = minGang;
    delete state.pendingClaims;
    append(
      state,
      events,
      { type: "public" },
      {
        type: EVENT_TYPES.gangMade,
        seat: minGang,
        gangType: "minGang",
        from: pending.discard.seat,
      },
    );
    settleGang(state, events, minGang, 2, [pending.discard.seat]);
    drawReplacement(state, events, minGang);
    return { state, events };
  }
  if (peng !== undefined) {
    const tile = pending.discard.tile;
    const matching = sameKind(state.seats[peng]!.hand, tile);
    state.seats[peng]!.hand = remove(remove(state.seats[peng]!.hand, matching[0]!), matching[1]!);
    state.seats[peng]!.melds.push({
      type: "peng",
      tiles: [matching[0]!, matching[1]!, tile],
      from: pending.discard.seat,
    });
    const discard = state.seats[pending.discard.seat]!.discards.at(-1);
    if (discard) discard.claimedBy = peng;
    state.currentSeat = peng;
    state.phase = "playing";
    delete state.pendingClaims;
    append(
      state,
      events,
      { type: "public" },
      {
        type: "PengMade",
        seat: peng,
        from: pending.discard.seat,
        tiles: [matching[0]!, matching[1]!, tile],
      },
    );
    append(state, events, { type: "public" }, { type: EVENT_TYPES.turnStarted, seat: peng });
    return { state, events };
  }
  delete state.pendingClaims;
  return drawNext(state, events, pending.discard.seat);
};

export const applyAction = (
  input: BloodbattleState,
  seat: SeatId,
  action: BloodbattleAction,
): BloodbattleApplyResult => {
  const state = cloneState(input);
  const events: GameEvent[] = [];
  if (action.type === "exchangeThree") return applyExchangeThree(state, seat, action.tiles);
  if (action.type === "chooseLack") return applyChooseLack(state, seat, action.suit);
  if (action.type === "discard") return checked(applyDiscard(state, seat, action.tile, events));
  if (action.type === "anGang") return checked(applyAnGang(state, seat, action.kind, events));
  if (action.type === "buGang") return checked(applyBuGang(state, seat, action.tile, events));
  if (state.phase === "awaiting-claims") {
    if (!state.pendingClaims?.options[seat] || state.pendingClaims.responses[seat])
      return fail("CLAIM_NOT_AVAILABLE");
    if (
      action.type !== "pass" &&
      !state.pendingClaims.options[seat]!.some((option) => option.action.type === action.type)
    )
      return fail("CLAIM_NOT_AVAILABLE");
    state.pendingClaims.responses[seat] = action;
    append(state, events, { type: "public" }, { type: EVENT_TYPES.claimResponded, seat, action });
    if (
      Object.keys(state.pendingClaims.options).every(
        (candidate) => state.pendingClaims!.responses[candidate as unknown as SeatId],
      )
    )
      return checked(resolveClaims(state, events));
    return { state, events };
  }
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("ACTION_NOT_AVAILABLE");
  if (action.type === "zimo" && isWin(state, seat)) {
    finishWin(state, events, seat, state.seats[seat]!.hand.at(-1)!, "zimo");
    delete state.lastGangEventId;
    return checked({ state, events });
  }
  return fail("UNKNOWN_ACTION");
};
const checked = (result: BloodbattleApplyResult): BloodbattleApplyResult => {
  if ("state" in result) assertTileConservation(result.state, BLOODBATTLE_TILE_SET, extraTiles);
  return result;
};

export const getLegalActions = (
  state: BloodbattleState,
  seat: SeatId,
): readonly BloodbattleAction[] => {
  if (state.phase === "awaiting-claims") {
    const options = state.pendingClaims?.options[seat] ?? [];
    return state.pendingClaims?.responses[seat]
      ? []
      : [...options.map((option) => option.action), { type: "pass" }];
  }
  if (state.phase !== "playing" || state.currentSeat !== seat || state.status[seat] !== "active")
    return [];
  const actions: BloodbattleAction[] = state.seats[seat]!.hand.filter(
    (tile) => kind(tile)[1] === state.lack?.[seat],
  ).map((tile) => ({ type: "discard", tile }));
  for (const candidate of new Set(state.seats[seat]!.hand.map(kind))) {
    if (sameKindValue(state.seats[seat]!.hand, candidate).length === 4)
      actions.push({ type: "anGang", kind: candidate });
  }
  for (const meld of state.seats[seat]!.melds)
    if (meld.type === "peng") {
      const tile = state.seats[seat]!.hand.find(
        (candidate) => kind(candidate) === kind(meld.tiles[0]!),
      );
      if (tile !== undefined) actions.push({ type: "buGang", tile });
    }
  if (isWin(state, seat)) actions.push({ type: "zimo" });
  return actions;
};
