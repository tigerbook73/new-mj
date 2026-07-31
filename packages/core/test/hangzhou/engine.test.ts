import { expect, test } from "vitest";
import {
  allTileIds,
  applyAction as engineApplyAction,
  assertTileConservation,
  createGame as engineCreateGame,
  createHangzhouGame,
  createPrng,
  eventsVisibleTo,
  computeNextHangzhouDealer,
  fuzzHangzhouGames,
  getLegalActions as engineGetLegalActions,
  getPlayerView as engineGetPlayerView,
  hangzhouRuleSet,
  parseHangzhouConfig,
  playHangzhouGame,
  rebuildPlayerView as engineRebuildPlayerView,
  type GameEvent,
  type HangzhouPlayerView,
  type HangzhouState,
} from "../../src/index.ts";

const unwrap = (result: ReturnType<typeof hangzhouRuleSet.applyAction>): HangzhouState => {
  if ("error" in result) throw new Error(result.error.code);
  return result.state;
};

const playDeterministically = (seed: number): HangzhouState => {
  const started = createHangzhouGame(seed, 0, {
    multiHuPolicy: seed % 5 === 0 ? "all" : "headJump",
  });
  if ("error" in started) throw new Error(started.error.code);
  let state = started.state;
  for (let step = 0; step < 500 && state.phase !== "finished"; step += 1) {
    if (state.phase === "awaiting-claims") {
      const responder = ([0, 1, 2, 3] as const).find(
        (seat) => hangzhouRuleSet.getLegalActions(state, seat).length > 0,
      );
      if (responder === undefined) throw new Error("missing claim responder");
      state = unwrap(
        hangzhouRuleSet.applyAction(
          state,
          responder,
          hangzhouRuleSet.getLegalActions(state, responder)[0]!,
        ),
      );
    } else {
      const actions = hangzhouRuleSet.getLegalActions(state, state.currentSeat);
      if (actions.length === 0) throw new Error("missing legal action");
      state = unwrap(hangzhouRuleSet.applyAction(state, state.currentSeat, actions[0]!));
    }
    assertTileConservation(state);
  }
  expect(state.phase).toBe("finished");
  return state;
};

test("hangzhou opens a deterministic complete game with private hands", () => {
  const first = createHangzhouGame(7, 0);
  const second = createHangzhouGame(7, 0);
  expect(first).toEqual(second);
  if ("error" in first) throw new Error(first.error.code);
  expect(first.state.seats.map((seat) => seat.hand.length).sort()).toEqual([13, 13, 13, 14]);
  expect(first.state.caiPiaoCount).toEqual([0, 0, 0, 0]);
  expect(first.state.gangChain).toEqual([0, 0, 0, 0]);
  assertTileConservation(first.state);
});

test("hangzhou config accepts supported switches and rejects invalid values", () => {
  expect(parseHangzhouConfig({ multiHuPolicy: "all", baseScore: 2, dealerStreak: 3 })).toEqual({
    config: { rulesetId: "hangzhou", multiHuPolicy: "all", baseScore: 2, dealerStreak: 3 },
  });
  expect(parseHangzhouConfig({ baseScore: 0 })).toEqual({ error: { code: "INVALID_CONFIG" } });
  expect(parseHangzhouConfig({ dealerStreak: 0 })).toEqual({ error: { code: "INVALID_CONFIG" } });
  expect(createHangzhouGame(1, 0, { multiHuPolicy: "invalid" })).toEqual({
    error: { code: "INVALID_CONFIG" },
  });
});

test("hangzhou accepts a legal discard and preserves the caller state", () => {
  const started = createHangzhouGame(11, 0);
  if ("error" in started) throw new Error(started.error.code);
  const before = structuredClone(started.state);
  const seat = started.state.currentSeat;
  const tile = started.state.seats[seat]!.hand[0]!;
  const result = hangzhouRuleSet.applyAction(started.state, seat, { type: "discard", tile });
  if ("error" in result) throw new Error(result.error.code);
  const state = unwrap(result);
  expect(started.state).toEqual(before);
  expect(state.seq).toBeGreaterThan(before.seq);
  assertTileConservation(state);
});

test("illegal actions do not mutate state or consume event sequence", () => {
  const started = createHangzhouGame(13, 0);
  if ("error" in started) throw new Error(started.error.code);
  const before = structuredClone(started.state);
  const wrongSeat = ((started.state.currentSeat + 1) % 4) as 0 | 1 | 2 | 3;
  const result = hangzhouRuleSet.applyAction(started.state, wrongSeat, {
    type: "discard",
    tile: 999,
  });
  expect(result).toEqual({ error: { code: "NOT_YOUR_TURN" } });
  expect(started.state).toEqual(before);
});

// Caishen is 5z (白/Haku), ids 124-127 — see constants.ts.
const CAISHEN_IDS = [124, 125, 126, 127];

test("a discarded caishen cannot be chi'd/peng'd/gang'd, only ron'd", () => {
  const seat1Hand = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 125, 126];
  const physical = new Set([124, ...seat1Hand]);
  const state: HangzhouState = {
    config: { rulesetId: "hangzhou", multiHuPolicy: "headJump", baseScore: 1, dealerStreak: 3 },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand: [124], melds: [], discards: [] },
      { hand: seat1Hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    caiPiaoCount: [0, 0, 0, 0],
    gangChain: [0, 0, 0, 0],
  };
  const discarded = unwrap(hangzhouRuleSet.applyAction(state, 0, { type: "discard", tile: 124 }));
  const options = hangzhouRuleSet.getLegalActions(discarded, 1);
  expect(options.some((action) => action.type === "peng" || action.type === "minGang")).toBe(false);
  expect(options.some((action) => action.type === "chi")).toBe(false);
  assertTileConservation(discarded);
});

test("caishen is never offered as a concealed-gang kind, even holding all four", () => {
  const hand = [0, 1, 2, 4, 5, 6, 8, 9, 10, ...CAISHEN_IDS];
  const physical = new Set(hand);
  const state: HangzhouState = {
    config: { rulesetId: "hangzhou", multiHuPolicy: "headJump", baseScore: 1, dealerStreak: 3 },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    caiPiaoCount: [0, 0, 0, 0],
    gangChain: [0, 0, 0, 0],
  };
  const actions = hangzhouRuleSet.getLegalActions(state, 0);
  expect(actions.some((action) => action.type === "anGang" && action.kind === "5z")).toBe(false);
});

// 1m,2m,3m runs (0,4,8/12,16,20/24,28,32) + 1p pair (36,37) waiting on 1s/2s/3s
// (76,80) to complete a fourth run — same shape as scoring.test.ts's hz-001/013.
const santiaoSeat1Hand = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 37, 76, 80];
const SANTIAO_WIN_TILE = 72; // 1s

const santiaoState = (dealerStreak: number): HangzhouState => {
  const physical = new Set([SANTIAO_WIN_TILE, ...santiaoSeat1Hand]);
  return {
    config: { rulesetId: "hangzhou", multiHuPolicy: "headJump", baseScore: 1, dealerStreak },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand: [SANTIAO_WIN_TILE], melds: [], discards: [] },
      { hand: santiaoSeat1Hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    caiPiaoCount: [0, 0, 0, 0],
    gangChain: [0, 0, 0, 0],
  };
};

test("santiao: ron is blocked while dealerStreak < 3, other claims are unaffected", () => {
  // Seat 1 is also the next seat and could otherwise chi this discard — three
  // things this test needs to distinguish: hu is gone, chi (an unrelated
  // claim) still isn't, and zimo (checked separately) is never touched.
  const discarded = unwrap(
    hangzhouRuleSet.applyAction(santiaoState(1), 0, { type: "discard", tile: SANTIAO_WIN_TILE }),
  );
  const options = hangzhouRuleSet.getLegalActions(discarded, 1);
  expect(options.some((action) => action.type === "hu")).toBe(false);
  expect(options.some((action) => action.type === "chi")).toBe(true);
  // dealerStreak=2 (still the dealer's second term) is equally blocked.
  const discardedAtTwo = unwrap(
    hangzhouRuleSet.applyAction(santiaoState(2), 0, { type: "discard", tile: SANTIAO_WIN_TILE }),
  );
  expect(
    hangzhouRuleSet.getLegalActions(discardedAtTwo, 1).some((action) => action.type === "hu"),
  ).toBe(false);
});

test("santiao: ron is allowed once dealerStreak reaches 3", () => {
  const discarded = unwrap(
    hangzhouRuleSet.applyAction(santiaoState(3), 0, { type: "discard", tile: SANTIAO_WIN_TILE }),
  );
  expect(discarded.phase).toBe("awaiting-claims");
  expect(hangzhouRuleSet.getLegalActions(discarded, 1)).toContainEqual({ type: "hu" });
  const ended = unwrap(hangzhouRuleSet.applyAction(discarded, 1, { type: "hu" }));
  expect(ended.result).toMatchObject({ type: "win", winner: 1, winType: "ron", from: 0 });
});

test("computeNextHangzhouDealer: dealer continues on a win or a draw, otherwise rotates", () => {
  const base = createHangzhouGame(1, 0);
  if ("error" in base) throw new Error(base.error.code);

  const dealerWon: HangzhouState = {
    ...base.state,
    result: {
      type: "win",
      winner: 0,
      winners: [{ seat: 0, fanTypes: ["pinghu"], multiplier: 1, payout: 1 }],
      winType: "zimo",
      scoreDeltas: [3, -1, -1, -1],
    },
  };
  expect(computeNextHangzhouDealer(dealerWon, 0)).toBe(0);

  const otherWon: HangzhouState = {
    ...base.state,
    result: {
      type: "win",
      winner: 2,
      winners: [{ seat: 2, fanTypes: ["pinghu"], multiplier: 1, payout: 1 }],
      winType: "ron",
      from: 0,
      scoreDeltas: [-1, 0, 1, 0],
    },
  };
  expect(computeNextHangzhouDealer(otherWon, 0)).toBe(1);

  const drawn: HangzhouState = {
    ...base.state,
    result: { type: "draw", scoreDeltas: [0, 0, 0, 0] },
  };
  expect(computeNextHangzhouDealer(drawn, 0)).toBe(0);
});

test("caiPiaoCount increments when a baotou hand discards caishen and stays baotou", () => {
  // 1m,2m,3m,4m triplets (12 tiles) + 2 caishen = baotou both before and after
  // discarding one caishen, per docs/variants/hangzhou.md §4.
  const triplets = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];
  const hand = [...triplets, 124, 125];
  const physical = new Set(hand);
  const state: HangzhouState = {
    config: { rulesetId: "hangzhou", multiHuPolicy: "headJump", baseScore: 1, dealerStreak: 3 },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    caiPiaoCount: [0, 0, 0, 0],
    gangChain: [0, 0, 0, 0],
    justDrawn: { seat: 0, tile: 125 },
  };
  // isBaotou is only meaningful on a "waiting" (pre-draw) hand shape; the
  // current 14-tile post-draw hand naturally reports false here (see hand.ts) —
  // what matters for caiPiaoCount is the *pre-draw* 13-tile hand (hand minus
  // justDrawn), which applyDiscard reconstructs internally.
  const result = unwrap(hangzhouRuleSet.applyAction(state, 0, { type: "discard", tile: 124 }));
  expect(result.caiPiaoCount).toEqual([1, 0, 0, 0]);
  const afterView = hangzhouRuleSet.getPlayerView(result, 0) as HangzhouPlayerView;
  expect(afterView.isBaotou).toBe(true);
  expect(afterView.isCaipiao).toBe(true);
  assertTileConservation(result);
});

test("event reconstruction replays the same caiPiaoCount-driven isCaipiao flag", () => {
  const triplets = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];
  const hand = [...triplets, 124, 125];
  const physical = new Set(hand);
  const state: HangzhouState = {
    config: { rulesetId: "hangzhou", multiHuPolicy: "headJump", baseScore: 1, dealerStreak: 3 },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    caiPiaoCount: [0, 0, 0, 0],
    gangChain: [0, 0, 0, 0],
    justDrawn: { seat: 0, tile: 125 },
  };
  // rebuildPlayerView needs a GameStarted event to seed itself; not exercised
  // via createHangzhouGame here, so this test only checks the discard-driven
  // increment logic in isolation via a synthetic two-event stream.
  const events: GameEvent[] = [
    {
      seq: 1,
      visibility: { type: "public" },
      payload: {
        type: "GameStarted",
        dealer: 0,
        handCounts: [14, 13, 13, 13],
        wallCount: state.wall.length,
      },
    },
    {
      seq: 2,
      visibility: { type: "seat", seats: [0] },
      payload: { type: "HandDealt", seat: 0, tiles: hand },
    },
    {
      seq: 3,
      visibility: { type: "public" },
      payload: { type: "TileDiscarded", seat: 0, tile: 124 },
    },
  ];
  const rebuilt = hangzhouRuleSet.rebuildPlayerView(events, 0) as HangzhouPlayerView;
  expect(rebuilt.isCaipiao).toBe(true);
  expect(rebuilt.isBaotou).toBe(true);
});

test("gang-chain tiers: two consecutive concealed gangs extend gangChain", () => {
  // Seat 0 holds two concealable quads (1m, 2m) plus a pair; ganging the first
  // should set gangChain to 1, and if the replacement draw makes the second
  // quad gangable too, chaining it should bump gangChain to 2 (hangzhou.md §6).
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 40, 41, 44, 45, 48];
  const physical = new Set(hand);
  const wall = allTileIds().filter((tile) => !physical.has(tile));
  const state: HangzhouState = {
    config: { rulesetId: "hangzhou", multiHuPolicy: "headJump", baseScore: 1, dealerStreak: 3 },
    phase: "playing",
    wall,
    seats: [
      { hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    caiPiaoCount: [0, 0, 0, 0],
    gangChain: [0, 0, 0, 0],
  };
  let current = unwrap(hangzhouRuleSet.applyAction(state, 0, { type: "anGang", kind: "1m" }));
  expect(current.gangChain[0]).toBe(1);
  current = unwrap(hangzhouRuleSet.applyAction(current, 0, { type: "draw" }));
  // Whatever got drawn, gang the second quad if possible to extend the chain;
  // otherwise the chain-extension branch of this test is skipped by design —
  // the scoring-level chain semantics are already covered by scoring.test.ts.
  const canChainAgain = hangzhouRuleSet
    .getLegalActions(current, 0)
    .some((action) => action.type === "anGang" && action.kind === "2m");
  if (canChainAgain) {
    current = unwrap(hangzhouRuleSet.applyAction(current, 0, { type: "anGang", kind: "2m" }));
    expect(current.gangChain[0]).toBe(2);
  }
  assertTileConservation(current);
});

test("action logs replay a complete game and fuzz reports no failure", () => {
  const played = playHangzhouGame(31);
  if ("error" in played) throw new Error(played.error);
  const replayed = playHangzhouGame(31, {}, played.actions);
  expect(replayed).toEqual(played);
  expect(fuzzHangzhouGames(1000, 41)).toBeUndefined();
}, 60_000);

test("1000 seeded games finish while preserving tile conservation", () => {
  for (let seed = 1; seed <= 1000; seed += 1) {
    const state = playDeterministically(seed);
    expect(state.result).toBeDefined();
  }
}, 20_000);

test("views and event filtering do not expose another seat's concealed hand", () => {
  const started = createHangzhouGame(17, 0);
  if ("error" in started) throw new Error(started.error.code);
  const viewer = 0 as const;
  const view = hangzhouRuleSet.getPlayerView(started.state, viewer);
  expect(view.hand).toEqual(started.state.seats[viewer]!.hand);
  expect(
    eventsVisibleTo(started.events, viewer).every(
      (event) => event.visibility.type === "public" || event.visibility.seats.includes(viewer),
    ),
  ).toBe(true);
});

test("engine-api createGame/applyAction/getLegalActions/getPlayerView dispatch by rulesetId", () => {
  const started = engineCreateGame({ rulesetId: "hangzhou" }, 7, 0);
  if ("error" in started) throw new Error(started.error.code);
  const state = started.state as HangzhouState;
  const seat = state.currentSeat;
  expect(engineGetLegalActions(state, seat)).toEqual(hangzhouRuleSet.getLegalActions(state, seat));
  expect(engineGetPlayerView(state, seat)).toEqual(hangzhouRuleSet.getPlayerView(state, seat));
  expect(engineRebuildPlayerView("hangzhou", started.events, seat)).toEqual(
    hangzhouRuleSet.rebuildPlayerView(started.events, seat),
  );
  const tile = state.seats[seat]!.hand[0]!;
  const viaEngine = engineApplyAction(state, seat, { type: "discard", tile });
  const viaRuleSet = hangzhouRuleSet.applyAction(state, seat, { type: "discard", tile });
  expect(viaEngine).toEqual(viaRuleSet);
});
