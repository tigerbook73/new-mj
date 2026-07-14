import { expect, test } from "vitest";
import {
  assertTileConservation,
  applyAction,
  createJunkGame,
  eventsVisibleTo,
  getPlayerView,
  junkRuleSet,
  allTileIds,
  createPrng,
  parseJunkConfig,
  rebuildPlayerView,
  type GameState,
} from "../src/index.ts";

const unwrap = (result: ReturnType<typeof junkRuleSet.applyAction>): GameState => {
  if ("error" in result) throw new Error(result.error.code);
  return result.state;
};

const playDeterministically = (seed: number): GameState => {
  const started = createJunkGame(seed, {
    sevenPairs: seed % 2 === 0,
    robKong: seed % 3 === 0,
    multiHuPolicy: seed % 5 === 0 ? "all" : "headJump",
  });
  if ("error" in started) throw new Error(started.error.code);
  let state = started.state;
  for (let step = 0; step < 500 && state.phase !== "finished"; step += 1) {
    const actions = junkRuleSet.getLegalActions(state, state.currentSeat);
    // In a claim window, currentSeat is the discarder; submit one response for
    // each eligible seat before requesting the next action.
    if (state.phase === "awaiting-claims") {
      const responder = ([0, 1, 2, 3] as const).find((seat) => junkRuleSet.getLegalActions(state, seat).length > 0);
      if (responder === undefined) throw new Error("missing claim responder");
      state = unwrap(junkRuleSet.applyAction(state, responder, junkRuleSet.getLegalActions(state, responder)[0]!));
    } else {
      if (actions.length === 0) throw new Error("missing legal action");
      state = unwrap(junkRuleSet.applyAction(state, state.currentSeat, actions[0]!));
    }
    assertTileConservation(state);
  }
  expect(state.phase).toBe("finished");
  return state;
};

test("junk opens a deterministic complete game with private hands", () => {
  const first = createJunkGame(7);
  const second = createJunkGame(7);
  expect(first).toEqual(second);
  if ("error" in first) throw new Error(first.error.code);
  expect(first.state.seats.map((seat) => seat.hand.length).sort()).toEqual([13, 13, 13, 14]);
  expect(first.state.wall).toHaveLength(83);
  assertTileConservation(first.state);
  expect(first.events.filter((event) => event.payload && (event.payload as { type?: string }).type === "HandDealt")).toHaveLength(4);
});

test("junk config accepts supported switches and rejects invalid values", () => {
  expect(parseJunkConfig({ sevenPairs: true, robKong: true, multiHuPolicy: "all" })).toEqual({
    config: { rulesetId: "junk", sevenPairs: true, robKong: true, multiHuPolicy: "all" },
  });
  expect(parseJunkConfig({ sevenPairs: "yes" })).toEqual({ error: { code: "INVALID_CONFIG" } });
  expect(createJunkGame(1, { multiHuPolicy: "invalid" })).toEqual({ error: { code: "INVALID_CONFIG" } });
});

test("junk accepts a legal discard and preserves the caller state", () => {
  const started = createJunkGame(11);
  if ("error" in started) throw new Error(started.error.code);
  const before = structuredClone(started.state);
  const seat = started.state.currentSeat;
  const tile = started.state.seats[seat]!.hand[0]!;
  const result = applyAction(started.state, seat, { type: "discard", tile });
  if ("error" in result) throw new Error(result.error.code);
  const state = unwrap(result);
  expect(started.state).toEqual(before);
  expect(state.seq).toBeGreaterThan(before.seq);
  expect(result.events.some((event) => (event.payload as { type?: string }).type === "TileDiscarded")).toBe(true);
  assertTileConservation(state);
});

test("views and event filtering do not expose another seat's concealed hand", () => {
  const started = createJunkGame(17);
  if ("error" in started) throw new Error(started.error.code);
  const viewer = 0 as const;
  const view = getPlayerView(started.state, viewer);
  expect(view.hand).toEqual(started.state.seats[viewer]!.hand);
  expect(view.seats.map((seat) => seat.handCount)).toEqual(started.state.seats.map((seat) => seat.hand.length));
  expect(eventsVisibleTo(started.events, viewer).every((event) =>
    event.visibility.type === "public" || event.visibility.seats.includes(viewer),
  )).toBe(true);
  expect(eventsVisibleTo(started.events, viewer).filter((event) =>
    (event.payload as { type?: string }).type === "HandDealt",
  )).toHaveLength(1);
});

test("filtered events rebuild the same initial player view as direct derivation", () => {
  const started = createJunkGame(19);
  if ("error" in started) throw new Error(started.error.code);
  for (const seat of [0, 1, 2, 3] as const) {
    expect(rebuildPlayerView(started.events, seat)).toEqual(getPlayerView(started.state, seat));
  }
});

test("filtered event replay remains equal to direct views through gameplay", () => {
  const started = createJunkGame(23);
  if ("error" in started) throw new Error(started.error.code);
  let state = started.state;
  const events = [...started.events];
  for (let step = 0; step < 30 && state.phase !== "finished"; step += 1) {
    const seat = state.phase === "awaiting-claims"
      ? ([0, 1, 2, 3] as const).find((candidate) => junkRuleSet.getLegalActions(state, candidate).length > 0)!
      : state.currentSeat;
    const action = junkRuleSet.getLegalActions(state, seat)[0]!;
    const result = applyAction(state, seat, action);
    if ("error" in result) throw new Error(result.error.code);
    state = result.state;
    events.push(...result.events);
    for (const viewer of [0, 1, 2, 3] as const) {
      expect(rebuildPlayerView(events, viewer)).toEqual(getPlayerView(state, viewer));
    }
  }
});

test("public draw and concealed-gang events never contain a TileId", () => {
  const started = createJunkGame(29);
  if ("error" in started) throw new Error(started.error.code);
  for (const event of started.events) {
    if (event.visibility.type !== "public") continue;
    const payload = event.payload as { type?: string; tile?: number; tiles?: number[]; gangType?: string };
    if (payload.type === "TileDrawn" || payload.type === "GangReplacementDrawn") expect(payload.tile).toBeUndefined();
    if (payload.type === "GangMade" && payload.gangType === "anGang") expect(payload.tiles).toBeUndefined();
  }
});

test("illegal actions do not mutate state or consume event sequence", () => {
  const started = createJunkGame(13);
  if ("error" in started) throw new Error(started.error.code);
  const before = structuredClone(started.state);
  const wrongSeat = ((started.state.currentSeat + 1) % 4) as 0 | 1 | 2 | 3;
  const result = junkRuleSet.applyAction(started.state, wrongSeat, { type: "discard", tile: 999 });
  expect(result).toEqual({ error: { code: "NOT_YOUR_TURN" } });
  expect(started.state).toEqual(before);
});

test("robKong opens a hu-only claim window and preserves the fourth tile on ron", () => {
  const seat1Hand = [0, 8, 12, 13, 14, 16, 17, 18, 20, 21, 22, 24, 25];
  const physical = new Set([4, 5, 6, 7, ...seat1Hand]);
  const state: GameState = {
    config: { rulesetId: "junk", sevenPairs: false, robKong: true, multiHuPolicy: "headJump" },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand: [7], melds: [{ type: "peng", tiles: [4, 5, 6], from: 2 }], discards: [] },
      { hand: seat1Hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [{ tile: 6, claimedBy: 0 }] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    variantState: {},
  };
  const opened = unwrap(applyAction(state, 0, { type: "buGang", tile: 7 }));
  expect(opened.phase).toBe("awaiting-claims");
  expect(junkRuleSet.getLegalActions(opened, 1)).toContainEqual({ type: "hu" });
  const ended = unwrap(applyAction(opened, 1, { type: "hu" }));
  expect(ended.result).toMatchObject({ type: "win", winner: 1, from: 0 });
  expect(ended.seats[0]!.hand).toContain(7);
  expect(ended.seats[0]!.melds[0]!.type).toBe("peng");
  assertTileConservation(ended);
});

const multiHuState = (multiHuPolicy: "headJump" | "all"): GameState => {
  const seat1Hand = [0, 8, 12, 13, 14, 16, 17, 18, 20, 21, 22, 24, 25];
  const seat2Hand = [1, 9, 28, 29, 30, 32, 33, 34, 36, 37, 38, 40, 41];
  const physical = new Set([7, ...seat1Hand, ...seat2Hand]);
  return {
    config: { rulesetId: "junk", sevenPairs: false, robKong: false, multiHuPolicy },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand: [7], melds: [], discards: [] },
      { hand: seat1Hand, melds: [], discards: [] },
      { hand: seat2Hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    seq: 0,
    prng: createPrng(1),
    variantState: {},
  };
};

test("multiHuPolicy selects head jump or all ron winners deterministically", () => {
  let state = unwrap(applyAction(multiHuState("headJump"), 0, { type: "discard", tile: 7 }));
  state = unwrap(applyAction(state, 1, { type: "hu" }));
  state = unwrap(applyAction(state, 2, { type: "hu" }));
  expect(state.result).toMatchObject({ winner: 1, winners: [1], scoreDeltas: [-1, 1, 0, 0] });

  state = unwrap(applyAction(multiHuState("all"), 0, { type: "discard", tile: 7 }));
  state = unwrap(applyAction(state, 1, { type: "hu" }));
  state = unwrap(applyAction(state, 2, { type: "hu" }));
  expect(state.result).toMatchObject({ winner: 1, winners: [1, 2], scoreDeltas: [-2, 1, 1, 0] });
  assertTileConservation(state);
});

test("1000 seeded games finish while preserving tile conservation", () => {
  for (let seed = 1; seed <= 1000; seed += 1) {
    const state = playDeterministically(seed);
    expect(state.result).toBeDefined();
  }
}, 20_000);
