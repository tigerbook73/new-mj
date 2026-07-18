import type { GameEvent } from "../../events.ts";
import { createEvent, EVENT_TYPES, nextEventSeq } from "../../events.ts";
import type { SeatId, TileKind } from "../../lib/ids.ts";
import { BLOODBATTLE_SEATS, BLOODBATTLE_TILE_SET } from "./constants.ts";
import { ronCandidates } from "./tingpai.ts";
import type { BloodbattleState } from "./types.ts";
import { scoreBloodbattleHand } from "./scoring.ts";

const seats = BLOODBATTLE_SEATS;
type ScoreDeltas = [number, number, number, number];

const append = (state: BloodbattleState, events: GameEvent[], payload: unknown): void => {
  state.seq = nextEventSeq(state.seq);
  events.push(createEvent(state.seq, { type: "public" }, payload));
};

const scoreDeltas = (): ScoreDeltas => [0, 0, 0, 0];

const addPayment = (
  state: BloodbattleState,
  deltas: ScoreDeltas,
  payer: SeatId,
  receiver: SeatId,
  amount: number,
): void => {
  state.scores[payer] -= amount;
  state.scores[receiver] += amount;
  deltas[payer] -= amount;
  deltas[receiver] += amount;
};

const allKinds = (state: BloodbattleState, seat: SeatId): TileKind[] => {
  const entry = state.seats[seat]!;
  return [...entry.hand, ...entry.melds.flatMap((meld) => meld.tiles)].map((tile) =>
    BLOODBATTLE_TILE_SET.kindOf(tile),
  );
};

const meldsForScoring = (state: BloodbattleState, seat: SeatId) =>
  state.seats[seat]!.melds.map((meld) => ({
    type: meld.type === "chi" ? ("peng" as const) : meld.type,
    tiles: meld.tiles.map((tile) => BLOODBATTLE_TILE_SET.kindOf(tile)),
  }));

const isHuaZhu = (state: BloodbattleState, seat: SeatId): boolean => {
  const suits = new Set(allKinds(state, seat).map((kind) => kind[1]));
  return ["m", "p", "s"].every((suit) => suits.has(suit));
};

const ronMultiplier = (state: BloodbattleState, seat: SeatId, tile: TileKind): number => {
  const entry = state.seats[seat]!;
  const result = scoreBloodbattleHand({
    config: { capFan: state.config.capFan, selfDrawBonus: state.config.selfDrawBonus },
    hand: entry.hand.map((candidate) => BLOODBATTLE_TILE_SET.kindOf(candidate)),
    melds: meldsForScoring(state, seat),
    lack: state.lack?.[seat]!,
    win: { tile, by: "discard" },
  });
  return result.hu ? result.multiplier : 0;
};

const maxRonMultiplier = (state: BloodbattleState, seat: SeatId): number => {
  const entry = state.seats[seat]!;
  const hand = entry.hand.map((tile) => BLOODBATTLE_TILE_SET.kindOf(tile));
  const melds = meldsForScoring(state, seat);
  const lack = state.lack?.[seat]!;
  return Math.max(
    0,
    ...ronCandidates(hand, melds, lack).map((tile) => ronMultiplier(state, seat, tile)),
  );
};

const emitSettlement = (
  state: BloodbattleState,
  events: GameEvent[],
  reason: string,
  deltas: ScoreDeltas,
): void => {
  if (deltas.some((delta) => delta !== 0))
    append(state, events, { type: EVENT_TYPES.settled, reason, scoreDeltas: deltas });
};

const settleHuaZhu = (state: BloodbattleState, events: GameEvent[]): Set<SeatId> => {
  const huaZhu = new Set(
    seats.filter((seat) => state.status[seat] === "active" && isHuaZhu(state, seat)),
  );
  if (!state.config.checkHuaZhu || huaZhu.size === 0) return huaZhu;
  const amount = 2 ** state.config.capFan!;
  const deltas = scoreDeltas();
  for (const payer of huaZhu)
    for (const receiver of seats)
      if (state.status[receiver] === "active" && !huaZhu.has(receiver))
        addPayment(state, deltas, payer, receiver, amount);
  emitSettlement(state, events, "huaZhu", deltas);
  return huaZhu;
};

const settleGangRefund = (
  state: BloodbattleState,
  events: GameEvent[],
  huaZhu: ReadonlySet<SeatId>,
  ting: ReadonlySet<SeatId>,
): void => {
  if (!state.config.gangRefund) return;
  const deltas = scoreDeltas();
  for (const payment of state.gangPayments) {
    const eligible =
      state.status[payment.payer] === "active" &&
      (huaZhu.has(payment.payer) || !ting.has(payment.payer));
    if (!eligible || payment.refunded || payment.transferred) continue;
    addPayment(state, deltas, payment.opener, payment.payer, payment.amount);
    payment.refunded = true;
  }
  emitSettlement(state, events, "gangRefund", deltas);
};

const settleDaJiao = (
  state: BloodbattleState,
  events: GameEvent[],
  huaZhu: ReadonlySet<SeatId>,
  ting: ReadonlySet<SeatId>,
  maxRon: readonly number[],
): void => {
  if (!state.config.checkDaJiao) return;
  const deltas = scoreDeltas();
  for (const payer of seats) {
    if (state.status[payer] !== "active" || huaZhu.has(payer) || ting.has(payer)) continue;
    for (const receiver of seats)
      if (
        receiver !== payer &&
        state.status[receiver] === "active" &&
        !huaZhu.has(receiver) &&
        ting.has(receiver)
      )
        addPayment(state, deltas, payer, receiver, maxRon[receiver]!);
  }
  emitSettlement(state, events, "daJiao", deltas);
};

export const settleBloodbattleDraw = (state: BloodbattleState, events: GameEvent[]): void => {
  const active = seats.filter((seat) => state.status[seat] === "active");
  const huaZhu = settleHuaZhu(state, events);
  const ting = new Set<SeatId>();
  const maxRon = [0, 0, 0, 0];
  for (const seat of active) {
    maxRon[seat] = maxRonMultiplier(state, seat);
    if (maxRon[seat]! > 0) ting.add(seat);
  }
  settleGangRefund(state, events, huaZhu, ting);
  settleDaJiao(state, events, huaZhu, ting, maxRon);
  state.phase = "finished";
  state.result = {
    winners: seats.filter((seat) => state.status[seat] === "won"),
    endReason: "wallExhausted",
  };
  append(state, events, { type: EVENT_TYPES.wallExhausted });
  append(state, events, { type: EVENT_TYPES.gameEnded, result: state.result });
};
