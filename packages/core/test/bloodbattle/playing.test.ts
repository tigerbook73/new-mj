import { expect, test } from "vitest";
import type { GameEvent } from "@/events";
import {
  allTileIds,
  applyAction,
  createGame,
  createPrng,
  fuzzBloodbattleGames,
  playBloodbattleGame,
  bloodbattleRuleSet,
  getLegalActions,
  settleBloodbattleDraw,
  type BloodbattleState,
} from "@/index";
import { BLOODBATTLE_TILE_SET } from "@/rulesets/bloodbattle/prelude";

const config = {
  rulesetId: "bloodbattle" as const,
  exchangeThree: false,
  capFan: 4,
  multiWinOnDiscard: true,
  robKong: true,
  checkHuaZhu: true,
  checkDaJiao: true,
  gangRefund: true,
  selfDrawBonus: "addFan" as const,
  mustHuOnLastFour: false,
};

const playingState = (): BloodbattleState => {
  const ids = allTileIds(BLOODBATTLE_TILE_SET);
  const hand = [...ids.slice(0, 4), ...ids.slice(36, 45)];
  return {
    config,
    phase: "playing",
    wall: ids.filter((id) => !hand.includes(id)),
    seats: [
      { hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    scores: [0, 0, 0, 0],
    status: ["active", "active", "active", "active"],
    gangPayments: [],
    lack: { 0: "m", 1: "p", 2: "s", 3: "m" },
  };
};

test("bloodbattle is registered in the engine", () => {
  const result = createGame(config, 7);
  expect("state" in result).toBe(true);
  if ("state" in result)
    expect(result.state).toMatchObject({ config: { rulesetId: "bloodbattle" } });
});

test("playing only offers lack-suit discards and draws for the next active seat", () => {
  const state = playingState();
  const actions = getLegalActions(state, 0) as Array<{ type: string; tile?: number }>;
  expect(actions.filter((action) => action.type === "discard")).toEqual([
    { type: "discard", tile: 0 },
    { type: "discard", tile: 1 },
    { type: "discard", tile: 2 },
    { type: "discard", tile: 3 },
  ]);
  const result = applyAction(state, 0, { type: "discard", tile: 0 });
  expect("state" in result).toBe(true);
  if ("state" in result) {
    const next = result.state as BloodbattleState;
    expect(next.phase).toBe("playing");
    expect(next.currentSeat).toBe(1);
    expect(next.seats[1]!.hand).toContain(4);
    expect(next.seats[0]!.discards).toEqual([{ tile: 0 }]);
  }
});

test("wall exhaustion runs bloodbattle end settlement", () => {
  const state = playingState();
  state.seats[0]!.hand = [0];
  state.seats[1]!.hand = Array.from({ length: 36 }, (_, index) => index + 1);
  state.seats[2]!.hand = Array.from({ length: 36 }, (_, index) => index + 37);
  state.seats[3]!.hand = Array.from({ length: 35 }, (_, index) => index + 73);
  state.status = ["active", "won", "won", "won"];
  state.wall = [];
  const result = applyAction(state, 0, { type: "discard", tile: 0 });
  expect("state" in result).toBe(true);
  if ("state" in result) {
    const next = result.state as BloodbattleState;
    expect(next.phase).toBe("finished");
    expect(next.result).toEqual({ winners: [1, 2, 3], endReason: "wallExhausted" });
    expect(result.events.map((event) => (event.payload as { type?: string }).type)).toContain(
      "GameEnded",
    );
  }
});

test("anGang records a meld, pays active seats, and draws a replacement tile", () => {
  const result = applyAction(playingState(), 0, { type: "anGang", kind: "1m" });
  expect("state" in result).toBe(true);
  if ("state" in result) {
    const next = result.state as BloodbattleState;
    expect(next.seats[0]!.melds).toEqual([{ type: "anGang", tiles: [0, 1, 2, 3] }]);
    expect(next.seats[0]!.hand).toContain(4);
    expect(next.scores).toEqual([6, -2, -2, -2]);
    expect(next.gangPayments).toHaveLength(3);
  }
});

test("buGang upgrades an existing peng and charges one point from each active seat", () => {
  const state = playingState();
  state.seats[0]!.melds = [{ type: "peng", tiles: [0, 1, 2], from: 1 }];
  state.seats[0]!.hand = state.seats[0]!.hand.filter((tile) => ![0, 1, 2].includes(tile));
  state.wall = allTileIds(BLOODBATTLE_TILE_SET).filter(
    (tile) =>
      !state.seats.some(
        (entry) =>
          entry.hand.includes(tile) || entry.melds.some((meld) => meld.tiles.includes(tile)),
      ),
  );
  const result = applyAction(state, 0, { type: "buGang", tile: 3 });
  expect("state" in result).toBe(true);
  if ("state" in result) {
    const next = result.state as BloodbattleState;
    expect(next.seats[0]!.melds).toEqual([{ type: "buGang", tiles: [0, 1, 2, 3], from: 1 }]);
    expect(next.scores).toEqual([3, -1, -1, -1]);
    expect(next.gangPayments.every((payment) => payment.amount === 1)).toBe(true);
  }
});

test("minGang resolves from a discard and charges only the discarder", () => {
  const state = playingState();
  state.seats[0]!.hand = [4, ...state.seats[0]!.hand.filter((tile) => tile >= 36)];
  state.seats[1]!.hand = [5, 6, 7];
  state.wall = allTileIds(BLOODBATTLE_TILE_SET).filter(
    (tile) =>
      !state.seats.some(
        (entry) =>
          entry.hand.includes(tile) || entry.melds.some((meld) => meld.tiles.includes(tile)),
      ),
  );
  const discarded = applyAction(state, 0, { type: "discard", tile: 4 });
  expect("state" in discarded).toBe(true);
  if (!("state" in discarded)) return;
  const claimed = applyAction(discarded.state as BloodbattleState, 1, { type: "minGang" });
  expect("state" in claimed).toBe(true);
  if ("state" in claimed) {
    const next = claimed.state as BloodbattleState;
    expect(next.seats[1]!.melds[0]).toMatchObject({ type: "minGang", from: 0 });
    expect(next.scores).toEqual([-2, 2, 0, 0]);
    expect(next.gangPayments).toEqual([
      { gangEventId: expect.any(Number), opener: 1, payer: 0, amount: 2 },
    ]);
  }
});

test("buGang opens a rob-kong window before collecting gang payments", () => {
  const state = playingState();
  state.seats[0]!.melds = [{ type: "peng", tiles: [4, 5, 6], from: 1 }];
  state.seats[0]!.hand = [7, ...state.seats[0]!.hand.filter((tile) => tile >= 36)];
  state.seats[1]!.hand = [8, 9, 10, 12, 13, 14, 16, 17, 18, 20, 21, 22, 24];
  state.lack![1] = "s";
  state.wall = allTileIds(BLOODBATTLE_TILE_SET).filter(
    (tile) =>
      !state.seats.some(
        (entry) =>
          entry.hand.includes(tile) || entry.melds.some((meld) => meld.tiles.includes(tile)),
      ),
  );
  const opened = applyAction(state, 0, { type: "buGang", tile: 7 });
  expect("state" in opened).toBe(true);
  if (!("state" in opened)) return;
  const openedState = opened.state as BloodbattleState;
  expect(openedState.phase).toBe("awaiting-claims");
  expect(openedState.pendingClaims?.source).toBe("robKong");
  const robbed = applyAction(openedState, 1, { type: "hu" });
  expect("state" in robbed).toBe(true);
  if ("state" in robbed) {
    const next = robbed.state as BloodbattleState;
    expect(next.wins?.[1]?.winTile).toBe(7);
    expect(next.gangPayments).toHaveLength(0);
  }
});

test("mustHuOnLastFour forces a self-draw win instead of a discard", () => {
  const state = playingState();
  state.config.mustHuOnLastFour = true;
  state.wall = state.wall.slice(0, 4);
  const used = new Set<number>();
  const byKind = (tileKind: string): number => {
    const tile = allTileIds(BLOODBATTLE_TILE_SET).find(
      (candidate) => !used.has(candidate) && BLOODBATTLE_TILE_SET.kindOf(candidate) === tileKind,
    )!;
    used.add(tile);
    return tile;
  };
  state.seats[0]!.hand = [
    "1p",
    "2p",
    "3p",
    "4p",
    "5p",
    "6p",
    "7s",
    "8s",
    "9s",
    "1s",
    "2s",
    "3s",
    "9p",
    "9p",
  ].map(byKind);
  state.lack![0] = "m";
  const held = new Set(state.seats[0]!.hand);
  const remaining = allTileIds(BLOODBATTLE_TILE_SET).filter((tile) => !held.has(tile));
  state.wall = remaining.slice(0, 4);
  state.seats[1]!.hand = remaining.slice(4);

  expect(getLegalActions(state, 0)).toEqual([{ type: "zimo" }]);
  expect(applyAction(state, 0, { type: "discard", tile: state.seats[0]!.hand[0]! })).toEqual({
    error: { code: "MUST_HU" },
  });
});

test("mustHuOnLastFour forces a claim-window hu response", () => {
  const state = playingState();
  state.config.mustHuOnLastFour = true;
  state.wall = state.wall.slice(0, 4);
  state.phase = "awaiting-claims";
  state.pendingClaims = {
    discard: { seat: 0, tile: 0 },
    options: { 1: [{ action: { type: "peng" } }, { action: { type: "hu" } }] },
    responses: {},
  };

  expect(getLegalActions(state, 1)).toEqual([{ type: "hu" }]);
  expect(applyAction(state, 1, { type: "pass" })).toEqual({ error: { code: "MUST_HU" } });
});

test("杠上炮 transfers the latest gang payment exactly once", () => {
  const state = playingState();
  state.seats[0]!.hand = [7, ...state.seats[0]!.hand.filter((tile) => tile >= 36)];
  state.seats[1]!.hand = [8, 9, 10, 12, 13, 14, 16, 17, 18, 20, 21, 22, 24];
  state.lack![0] = "m";
  state.lack![1] = "s";
  state.scores = [2, 0, -2, 0];
  state.gangPayments = [{ gangEventId: 99, opener: 0, payer: 2, amount: 2 }];
  state.lastGangEventId = 99;
  state.wall = allTileIds(BLOODBATTLE_TILE_SET).filter(
    (tile) =>
      !state.seats.some(
        (entry) =>
          entry.hand.includes(tile) || entry.melds.some((meld) => meld.tiles.includes(tile)),
      ),
  );

  const opened = applyAction(state, 0, { type: "discard", tile: 7 });
  expect("state" in opened).toBe(true);
  if (!("state" in opened)) return;
  const claimed = applyAction(opened.state as BloodbattleState, 1, { type: "hu" });
  expect("state" in claimed).toBe(true);
  if ("state" in claimed) {
    const next = claimed.state as BloodbattleState;
    expect(next.scores[0]).toBe(0);
    expect(next.scores[2]).toBe(-2);
    expect(next.scores[1]).toBeGreaterThan(2);
    expect(next.gangPayments[0]).toMatchObject({ transferred: true });
    expect(next.lastGangEventId).toBeUndefined();
    expect(
      claimed.events.filter(
        (event) => (event.payload as { reason?: string }).reason === "gangTransfer",
      ),
    ).toHaveLength(1);
  }
});

test("draw settlement applies huaZhu, gang refund, then daJiao", () => {
  const state = playingState();
  state.seats[0]!.hand = [0, 36, 72];
  state.seats[1]!.hand = [8, 9, 10, 12, 13, 14, 16, 17, 18, 20, 21, 22, 24];
  state.seats[2]!.hand = [4];
  state.status = ["active", "active", "active", "won"];
  state.lack = { 0: "m", 1: "s", 2: "m", 3: "m" };
  state.scores = [0, 2, -2, 0];
  state.gangPayments = [{ gangEventId: 7, opener: 1, payer: 2, amount: 2 }];

  const events: GameEvent[] = [];
  settleBloodbattleDraw(state, events);

  expect(state.phase).toBe("finished");
  expect(state.scores[0]).toBe(-32);
  expect(state.scores[1]).toBeGreaterThan(16);
  expect(state.scores[2]).toBe(8);
  expect(state.gangPayments[0]).toMatchObject({ refunded: true });
  expect(events.map((event) => (event.payload as { reason?: string }).reason)).toEqual([
    "huaZhu",
    "gangRefund",
    "daJiao",
    undefined,
    undefined,
  ]);
});

test("10000 seeded bloodbattle games cover config combinations", () => {
  expect(fuzzBloodbattleGames(10_000, 73)).toBeUndefined();
}, 60_000);

test("bloodbattle public events and views expose kinds, never TileIds", () => {
  const state = playingState();
  state.seats[1]!.melds = [{ type: "peng", tiles: [4, 5, 6], from: 0 }];
  state.seats[1]!.discards = [{ tile: 7 }];
  state.lastDiscard = { seat: 1, tile: 7 };
  state.wins = { 1: { hand: [8], winTile: 9, lack: "s" } };
  const view = bloodbattleRuleSet.getPlayerView(state, 0);
  expect(view.lastDiscard).toEqual({ seat: 1, tile: "2m" });
  expect(view.seats[1]!.melds[0]!.tiles).toEqual(["2m", "2m", "2m"]);
  expect(view.seats[1]!.discards[0]!.tile).toBe("2m");
  expect(view.seats[1]!.winSnapshot).toMatchObject({ hand: ["3m"], winTile: "3m" });
  const played = playBloodbattleGame(101, { exchangeThree: false });
  expect("state" in played).toBe(true);
  if ("state" in played) {
    const hasPublicTileId = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some((item) => hasPublicTileId(item));
      if (typeof value !== "object" || value === null) return false;
      return Object.entries(value).some(([key, item]) =>
        ["tile", "tiles", "hand", "winTile"].includes(key)
          ? typeof item === "number" ||
            (Array.isArray(item) && item.some((entry) => typeof entry === "number"))
          : hasPublicTileId(item),
      );
    };
    for (const event of played.events) {
      if (event.visibility.type !== "public") continue;
      expect(hasPublicTileId(event.payload)).toBe(false);
    }
  }
});
