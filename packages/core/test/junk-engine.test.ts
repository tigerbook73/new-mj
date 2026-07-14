import { expect, test } from "vitest";
import {
  assertTileConservation,
  applyAction,
  createJunkGame,
  eventsVisibleTo,
  getPlayerView,
  junkRuleSet,
  parseJunkConfig,
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

test("illegal actions do not mutate state or consume event sequence", () => {
  const started = createJunkGame(13);
  if ("error" in started) throw new Error(started.error.code);
  const before = structuredClone(started.state);
  const wrongSeat = ((started.state.currentSeat + 1) % 4) as 0 | 1 | 2 | 3;
  const result = junkRuleSet.applyAction(started.state, wrongSeat, { type: "discard", tile: 999 });
  expect(result).toEqual({ error: { code: "NOT_YOUR_TURN" } });
  expect(started.state).toEqual(before);
});

test("1000 seeded games finish while preserving tile conservation", () => {
  for (let seed = 1; seed <= 1000; seed += 1) {
    const state = playDeterministically(seed);
    expect(state.result).toBeDefined();
  }
}, 20_000);
