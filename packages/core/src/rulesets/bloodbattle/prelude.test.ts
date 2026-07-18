import { expect, test } from "vitest";
import {
  STANDARD_TILE_SET,
  allTileIds,
  applyChooseLack,
  applyExchangeThree,
  createPrng,
  type BloodbattleState,
  type GameEvent,
  type SeatId,
} from "../../index.ts";

// Hand-rolled state for the pre-play phases only (no wall/turn machinery
// needed — see docs/plan.md 阶段 1.5). Four disjoint 13-tile concealed hands.
// TileIds 0-107 map to the same kind under STANDARD_TILE_SET and the
// bloodbattle (m/p/s-only) tile set, since honors are appended last in
// TILE_KINDS — safe to build hands from allTileIds() here as long as ids stay
// under 108, which slices 0..51 do.
const exchangingState = (): BloodbattleState => {
  const hands: [number[], number[], number[], number[]] = [
    allTileIds().slice(0, 13),
    allTileIds().slice(13, 26),
    allTileIds().slice(26, 39),
    allTileIds().slice(39, 52),
  ];
  return {
    config: {
      rulesetId: "bloodbattle",
      exchangeThree: true,
      capFan: 4,
      multiWinOnDiscard: true,
      robKong: true,
      checkHuaZhu: true,
      checkDaJiao: true,
      gangRefund: true,
      selfDrawBonus: "addFan",
      mustHuOnLastFour: false,
    },
    phase: "exchanging",
    wall: allTileIds().slice(52),
    seats: hands.map((hand) => ({ hand, melds: [], discards: [] })),
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    scores: [0, 0, 0, 0],
    status: ["active", "active", "active", "active"],
    gangPayments: [],
  };
};

const unwrap = <
  T extends { state: BloodbattleState; events: GameEvent[] } | { error: { code: string } },
>(
  result: T,
): { state: BloodbattleState; events: GameEvent[] } => {
  if ("error" in result) throw new Error(result.error.code);
  return result;
};

// A batch can carry seat-only events for several different seats at once
// (the 4th exchangeThree submission also resolves and emits each of the four
// TilesReceived payloads in the same call) — the leak check is just that no
// single seat-only event is ever broadcast to more than one seat, plus that
// this seat's own ExchangeThreeSelected really is addressed to itself.
const assertNoLeak = (events: readonly GameEvent[], submittingSeat: SeatId): void => {
  for (const event of events) {
    if (event.visibility.type !== "seat") continue;
    expect(event.visibility.seats).toHaveLength(1);
    if ((event.payload as { type?: string }).type === "ExchangeThreeSelected") {
      expect(event.visibility.seats).toEqual([submittingSeat]);
    }
  }
};

test("all four seats submit exchangeThree, hands actually swap, then all four submit chooseLack", () => {
  let state = exchangingState();
  const outgoing = new Map<SeatId, [number, number, number]>();
  const allEvents: GameEvent[] = [];

  for (const seat of [0, 1, 2, 3] as SeatId[]) {
    const hand = state.seats[seat]!.hand;
    const tiles: [number, number, number] = [hand[0]!, hand[1]!, hand[2]!];
    outgoing.set(seat, tiles);
    const { state: next, events } = unwrap(applyExchangeThree(state, seat, tiles));
    assertNoLeak(events, seat);
    state = next;
    allEvents.push(...events);
    if (seat < 3) expect(state.phase).toBe("exchanging");
  }
  expect(state.phase).toBe("choosing-lack");

  // Every hand keeps its size, and nobody keeps a tile they just gave away.
  for (const seat of [0, 1, 2, 3] as SeatId[]) {
    expect(state.seats[seat]!.hand).toHaveLength(13);
    const gaveAway = outgoing.get(seat)!;
    expect(state.seats[seat]!.hand.some((tile) => gaveAway.includes(tile))).toBe(false);
  }

  // The four TilesReceived (seat-only) payloads, pooled together, are exactly
  // a permutation of the four outgoing selections — nothing lost or duplicated.
  const received = allEvents
    .filter((event) => (event.payload as { type?: string }).type === "TilesReceived")
    .flatMap((event) => (event.payload as { tiles: number[] }).tiles);
  const sentAway = [...outgoing.values()].flat();
  expect([...received].sort((a, b) => a - b)).toEqual([...sentAway].sort((a, b) => a - b));
  expect(
    allEvents.some((event) => (event.payload as { type?: string }).type === "ExchangeCompleted"),
  ).toBe(true);

  for (const seat of [0, 1, 2, 3] as SeatId[]) {
    const suit = STANDARD_TILE_SET.kindOf(state.seats[seat]!.hand[0]!)[1] as "m" | "p" | "s";
    const { state: next } = unwrap(applyChooseLack(state, seat, suit));
    state = next;
  }
  expect(state.phase).toBe("playing");
  expect(state.currentSeat).toBe(0);
});
