import { expect, test } from "vitest";
import {
  assertTileConservation,
  applyAction as engineApplyAction,
  computeNextJunkDealer,
  createGame as engineCreateGame,
  createJunkGame,
  eventsVisibleTo,
  getLegalActions as engineGetLegalActions,
  getPlayerView as engineGetPlayerView,
  rebuildPlayerView as engineRebuildPlayerView,
  junkRuleSet,
  allTileIds,
  createPrng,
  parseJunkConfig,
  fuzzJunkGames,
  playJunkGame,
  sortTileIdsForDisplay,
  type JunkPlayerView,
  type JunkState,
  type SeatId,
} from "../../src/index.ts";

const unwrap = (result: ReturnType<typeof junkRuleSet.applyAction>): JunkState => {
  if ("error" in result) throw new Error(result.error.code);
  return result.state;
};

const playDeterministically = (seed: number): JunkState => {
  const started = createJunkGame(seed, 0);
  if ("error" in started) throw new Error(started.error.code);
  let state = started.state;
  for (let step = 0; step < 500 && state.phase !== "finished"; step += 1) {
    const actions = junkRuleSet.getLegalActions(state, state.currentSeat);
    // In a claim window, currentSeat is the discarder; submit one response for
    // each eligible seat before requesting the next action.
    if (state.phase === "awaiting-claims") {
      const responder = ([0, 1, 2, 3] as const).find(
        (seat) => junkRuleSet.getLegalActions(state, seat).length > 0,
      );
      if (responder === undefined) throw new Error("missing claim responder");
      state = unwrap(
        junkRuleSet.applyAction(
          state,
          responder,
          junkRuleSet.getLegalActions(state, responder)[0]!,
        ),
      );
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
  const first = createJunkGame(7, 0);
  const second = createJunkGame(7, 0);
  expect(first).toEqual(second);
  if ("error" in first) throw new Error(first.error.code);
  expect(first.state.seats.map((seat) => seat.hand.length).sort()).toEqual([13, 13, 13, 14]);
  expect(first.state.wall).toHaveLength(83);
  assertTileConservation(first.state);
  expect(
    first.events.filter(
      (event) => event.payload && (event.payload as { type?: string }).type === "HandDealt",
    ),
  ).toHaveLength(4);
});

test("junk config has no switches left", () => {
  expect(parseJunkConfig(undefined)).toEqual({ config: { rulesetId: "junk" } });
  expect(parseJunkConfig({})).toEqual({ config: { rulesetId: "junk" } });
  expect(parseJunkConfig({ sevenPairs: true })).toEqual({ error: { code: "INVALID_CONFIG" } });
  expect(parseJunkConfig({ robKong: false })).toEqual({ error: { code: "INVALID_CONFIG" } });
  expect(parseJunkConfig({ multiHuPolicy: "all" })).toEqual({ error: { code: "INVALID_CONFIG" } });
});

test("junk's dealer rotation formula: the winner sits next dealer (docs/variants/junk.md §4)", () => {
  const started = createJunkGame(19, 0);
  if ("error" in started) throw new Error(started.error.code);
  for (const currentDealer of [0, 1, 2, 3] as const) {
    // Winner becomes next dealer regardless of who was dealer this game — even
    // when they're the same seat, which trivially reproduces "dealer continues".
    for (const winner of [0, 1, 2, 3] as const) {
      const finished: JunkState = {
        ...started.state,
        result: {
          type: "win",
          winner,
          winners: [winner],
          winnerDetails: [{ seat: winner, fanTypes: [], multiplier: 1, payout: 0 }],
          winType: "zimo",
          scoreDeltas: [0, 0, 0, 0],
        },
      };
      expect(computeNextJunkDealer(finished, currentDealer)).toBe(winner);
    }
  }
});

test("junk's dealer rotation formula: a draw rotates to the current dealer's counterclockwise next seat", () => {
  const started = createJunkGame(19, 0);
  if ("error" in started) throw new Error(started.error.code);
  for (const currentDealer of [0, 1, 2, 3] as const) {
    const finished: JunkState = {
      ...started.state,
      result: { type: "draw", scoreDeltas: [0, 0, 0, 0] },
    };
    expect(computeNextJunkDealer(finished, currentDealer)).toBe((currentDealer + 1) % 4);
  }
});

test("junk accepts a legal discard and preserves the caller state", () => {
  const started = createJunkGame(11, 0);
  if ("error" in started) throw new Error(started.error.code);
  const before = structuredClone(started.state);
  const seat = started.state.currentSeat;
  const tile = started.state.seats[seat]!.hand[0]!;
  const result = junkRuleSet.applyAction(started.state, seat, { type: "discard", tile });
  if ("error" in result) throw new Error(result.error.code);
  const state = unwrap(result);
  expect(started.state).toEqual(before);
  expect(state.seq).toBeGreaterThan(before.seq);
  expect(
    result.events.some((event) => (event.payload as { type?: string }).type === "TileDiscarded"),
  ).toBe(true);
  assertTileConservation(state);
});

test("views and event filtering do not expose another seat's concealed hand", () => {
  const started = createJunkGame(17, 0);
  if ("error" in started) throw new Error(started.error.code);
  const viewer = 0 as const;
  const view = junkRuleSet.getPlayerView(started.state, viewer);
  // PlayerView.hand is returned in canonical display order (see lib/tiles.ts's
  // sortTileIdsForDisplay), not the internal seat state's insertion order.
  expect(view.hand).toEqual(sortTileIdsForDisplay(started.state.seats[viewer]!.hand));
  expect(view.seats.map((seat) => seat.handCount)).toEqual(
    started.state.seats.map((seat) => seat.hand.length),
  );
  expect(
    eventsVisibleTo(started.events, viewer).every(
      (event) => event.visibility.type === "public" || event.visibility.seats.includes(viewer),
    ),
  ).toBe(true);
  expect(
    eventsVisibleTo(started.events, viewer).filter(
      (event) => (event.payload as { type?: string }).type === "HandDealt",
    ),
  ).toHaveLength(1);
});

// "Event reconstruction ≡ direct derivation" moved to
// cross-ruleset-invariants.test.ts (parameterized over registered rulesets).

test("justDrawn: own view sees the tile, other seats only see a boolean flag", () => {
  const started = createJunkGame(11, 0);
  if ("error" in started) throw new Error(started.error.code);
  let state = started.state;
  let guard = 0;
  while (!state.justDrawn && guard < 80) {
    guard += 1;
    if (state.phase === "awaiting-claims") {
      const responder = ([0, 1, 2, 3] as const).find(
        (seat) => junkRuleSet.getLegalActions(state, seat).length > 0,
      )!;
      state = unwrap(
        junkRuleSet.applyAction(
          state,
          responder,
          junkRuleSet.getLegalActions(state, responder)[0]!,
        ),
      );
    } else {
      const actions = junkRuleSet.getLegalActions(state, state.currentSeat);
      state = unwrap(junkRuleSet.applyAction(state, state.currentSeat, actions[0]!));
    }
  }
  const drawn = state.justDrawn;
  if (!drawn) throw new Error("no draw observed within guard steps");
  for (const viewer of [0, 1, 2, 3] as const) {
    const view = junkRuleSet.getPlayerView(state, viewer) as JunkPlayerView;
    for (const candidate of [0, 1, 2, 3] as const) {
      expect(view.seats[candidate]!.justDrawn).toBe(candidate === drawn.seat);
    }
    expect(view.justDrawn).toBe(viewer === drawn.seat ? drawn.tile : undefined);
  }

  // Acting on the drawn tile clears it — everyone stops seeing that seat as
  // "just drew" (a subsequent draw, e.g. the next seat's turn starting via its
  // own later {type:"draw"} action, is a separate justDrawn and not asserted here).
  const nextActions = junkRuleSet.getLegalActions(state, drawn.seat);
  state = unwrap(junkRuleSet.applyAction(state, drawn.seat, nextActions[0]!));
  for (const viewer of [0, 1, 2, 3] as const) {
    const view = junkRuleSet.getPlayerView(state, viewer) as JunkPlayerView;
    expect(view.seats[drawn.seat]!.justDrawn).toBe(false);
  }
  expect(
    (junkRuleSet.getPlayerView(state, drawn.seat) as JunkPlayerView).justDrawn,
  ).toBeUndefined();
});

test("public draw and concealed-gang events never contain a TileId", () => {
  const started = createJunkGame(29, 0);
  if ("error" in started) throw new Error(started.error.code);
  for (const event of started.events) {
    if (event.visibility.type !== "public") continue;
    const payload = event.payload as {
      type?: string;
      tile?: number;
      tiles?: number[];
      gangType?: string;
    };
    if (payload.type === "TileDrawn" || payload.type === "GangReplacementDrawn")
      expect(payload.tile).toBeUndefined();
    if (payload.type === "GangMade" && payload.gangType === "anGang")
      expect(payload.tiles).toBeUndefined();
  }
});

test("action logs replay a complete game and fuzz reports no failure", { tags: ["slow"] }, () => {
  const played = playJunkGame(31);
  if ("error" in played) throw new Error(played.error);
  const replayed = playJunkGame(31, {}, played.actions);
  expect(replayed).toEqual(played);
  expect(fuzzJunkGames(100, 41)).toBeUndefined();
});

test("illegal actions do not mutate state or consume event sequence", () => {
  const started = createJunkGame(13, 0);
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
  const state: JunkState = {
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
    dealer: 3,
    gangChain: [0, 0, 0, 0],
    seq: 0,
    prng: createPrng(1),
  };
  const opened = unwrap(junkRuleSet.applyAction(state, 0, { type: "buGang", tile: 7 }));
  expect(opened.phase).toBe("awaiting-claims");
  expect(junkRuleSet.getLegalActions(opened, 1)).toContainEqual({ type: "hu" });
  const ended = unwrap(junkRuleSet.applyAction(opened, 1, { type: "hu" }));
  expect(ended.result).toMatchObject({ type: "win", winner: 1, from: 0 });
  expect(ended.seats[0]!.hand).toContain(7);
  expect(ended.seats[0]!.melds[0]!.type).toBe("peng");
  assertTileConservation(ended);
});

test("bug repro: zimo is not offered right after peng, even if the leftover concealed hand happens to already be complete", () => {
  // Seat 0 holds 3 complete triplets + a pair (already a full standalone hand
  // on its own) plus a spare pair of 9s — pengging that spare pair leaves the
  // original 3-melds-and-pair sitting there unchanged, which used to
  // (wrongly) satisfy isWin() and offer zimo despite no draw ever happening.
  const seat0Hand = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 104, 105];
  const DISCARD_TILE = 106; // 9s, matches the spare pair (104, 105)
  const physical = new Set([DISCARD_TILE, ...seat0Hand]);
  const state: JunkState = {
    config: { rulesetId: "junk", sevenPairs: false, robKong: false, multiHuPolicy: "headJump" },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand: seat0Hand, melds: [], discards: [] },
      { hand: [DISCARD_TILE], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 1,
    dealer: 2,
    gangChain: [0, 0, 0, 0],
    seq: 0,
    prng: createPrng(1),
  };
  const discarded = unwrap(
    junkRuleSet.applyAction(state, 1, { type: "discard", tile: DISCARD_TILE }),
  );
  // Both hu (ron) and peng are legitimately offered here — seat 0 deliberately
  // declines the win in favor of pengging, which this test needs specifically.
  expect(junkRuleSet.getLegalActions(discarded, 0)).toContainEqual({ type: "peng" });
  const pengged = unwrap(junkRuleSet.applyAction(discarded, 0, { type: "peng" }));
  expect(pengged.phase).toBe("playing");
  expect(pengged.currentSeat).toBe(0);
  expect(pengged.justDrawn).toBeUndefined();
  expect(junkRuleSet.getLegalActions(pengged, 0).some((action) => action.type === "zimo")).toBe(
    false,
  );
  assertTileConservation(pengged);
});

test("minGang (claimed open kong) requires the replacement draw before zimo — never directly", () => {
  const seat0Hand = [0, 1, 2, 16, 17, 20, 21, 24, 25, 28, 29, 36, 37];
  const DISCARD_TILE = 3; // the 4th 1m
  const physical = new Set([DISCARD_TILE, ...seat0Hand]);
  const state: JunkState = {
    config: { rulesetId: "junk", sevenPairs: false, robKong: false, multiHuPolicy: "headJump" },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand: seat0Hand, melds: [], discards: [] },
      { hand: [DISCARD_TILE], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 1,
    dealer: 2,
    gangChain: [0, 0, 0, 0],
    seq: 0,
    prng: createPrng(1),
  };
  const discarded = unwrap(
    junkRuleSet.applyAction(state, 1, { type: "discard", tile: DISCARD_TILE }),
  );
  expect(junkRuleSet.getLegalActions(discarded, 0)).toContainEqual({ type: "minGang" });
  const ganged = unwrap(junkRuleSet.applyAction(discarded, 0, { type: "minGang" }));
  expect(ganged.phase).toBe("awaiting-draw");
  expect(junkRuleSet.getLegalActions(ganged, 0)).toEqual([{ type: "draw" }]);
  // Claimed minGang counts toward the gangkai chain the same as a self-declared gang.
  expect(ganged.gangChain[0]).toBe(1);
  assertTileConservation(ganged);
});

test("杠上自摸 (self-draw off a gang's replacement tile) is legal once the draw actually happens", () => {
  // Seat 0 declares anGang on 1m (holding all 4 while it's their turn, i.e. a
  // 14-tile hand at that instant), leaving 2m2m2m/3m3m3m complete plus two
  // spare pairs (4m4m, 5m5m) — waiting on either pair's 3rd copy to complete
  // the hand. The wall's tail is rigged so the replacement draw is exactly
  // that tile, completing the hand via a genuine self-draw right after the
  // gang. This is also the repro for a separate, previously-unfixed bug:
  // isWin() used to flatten hand+meld tiles through lib/standard-hand.ts's
  // isStandardWinningHand, which requires the flat multiset to be exactly
  // (melds*3+2) tiles — any real gang contributes 4 physical tiles instead
  // of 3, so a hand containing one could never satisfy that count and
  // isWin() incorrectly returned false forever after. Fixed by checking only
  // the concealed hand (own.melds are already-validated complete groups the
  // check doesn't need to re-verify — isStandardWinningHand's own doc
  // comment says as much), matching how bloodbattle/hangzhou never flatten
  // melds into their win-shape checks either.
  const seat0Hand = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 16, 17];
  // 1m x4 (0-3, angang) + 2m x3 (4-6) + 3m x3 (8-10) + 4m pair (12,13) + 5m pair (16,17)
  const REPLACEMENT_TILE = 14; // 3rd 4m — completes 4m4m4m, leaving 5m5m as the pair
  const physical = new Set([...seat0Hand, REPLACEMENT_TILE]);
  const restOfWall = allTileIds().filter((tile) => !physical.has(tile));
  const state: JunkState = {
    config: { rulesetId: "junk", sevenPairs: false, robKong: false, multiHuPolicy: "headJump" },
    phase: "playing",
    // drawFromTail pops the *last* element — put the rigged tile there.
    wall: [...restOfWall, REPLACEMENT_TILE],
    seats: [
      { hand: seat0Hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    dealer: 1,
    gangChain: [0, 0, 0, 0],
    seq: 0,
    prng: createPrng(1),
  };
  const ganged = unwrap(junkRuleSet.applyAction(state, 0, { type: "anGang", kind: "1m" }));
  expect(ganged.phase).toBe("awaiting-draw");
  // Feeds the gangkai bonus once the replacement draw completes a zimo (junk.md §3).
  expect(ganged.gangChain[0]).toBe(1);
  // Not legal yet — the replacement hasn't been drawn.
  expect(junkRuleSet.getLegalActions(ganged, 0)).toEqual([{ type: "draw" }]);
  const drawn = unwrap(junkRuleSet.applyAction(ganged, 0, { type: "draw" }));
  expect(drawn.phase).toBe("playing");
  expect(drawn.justDrawn).toEqual({ seat: 0, tile: REPLACEMENT_TILE });
  expect(junkRuleSet.getLegalActions(drawn, 0)).toContainEqual({ type: "zimo" });
  const won = unwrap(junkRuleSet.applyAction(drawn, 0, { type: "zimo" }));
  expect(won.result).toMatchObject({ type: "win", winner: 0, winType: "zimo" });
  assertTileConservation(won);
});

test("a discard resets gangChain to 0 even after building one up", () => {
  const seat0Hand = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 16, 17];
  const REPLACEMENT_TILE = 14;
  const physical = new Set([...seat0Hand, REPLACEMENT_TILE]);
  const restOfWall = allTileIds().filter((tile) => !physical.has(tile));
  const state: JunkState = {
    config: { rulesetId: "junk", sevenPairs: false, robKong: false, multiHuPolicy: "headJump" },
    phase: "playing",
    wall: [...restOfWall, REPLACEMENT_TILE],
    seats: [
      { hand: seat0Hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    dealer: 1,
    gangChain: [0, 0, 0, 0],
    seq: 0,
    prng: createPrng(1),
  };
  const ganged = unwrap(junkRuleSet.applyAction(state, 0, { type: "anGang", kind: "1m" }));
  const drawn = unwrap(junkRuleSet.applyAction(ganged, 0, { type: "draw" }));
  expect(drawn.gangChain[0]).toBe(1);
  const discarded = unwrap(junkRuleSet.applyAction(drawn, 0, { type: "discard", tile: 16 }));
  expect(discarded.gangChain[0]).toBe(0);
});

// Both hands happen to complete on the shared discard's kind (2m). seat1's
// full hand (1m2m3m run + 4m4m4m/5m5m5m/6m6m6m triplets + 7m7m pair) is
// entirely "m" suit and fully concealed => qingyise(x4) * menqing(x2) = x8.
// seat2's hand (1m2m3m run + 8m8m8m/9m9m9m/1p1p1p triplets + 2p2p pair) mixes
// m and p => no qingyise/hunyise, just menqing(x2) = x2. `dealer` defaults to
// a seat uninvolved in either payment so these multipliers show up unscaled;
// the dedicated dealer-doubling tests below reuse this same fixture with
// dealer set to the payer or a winner instead.
const multiHuState = (dealer: SeatId = 3): JunkState => {
  const seat1Hand = [0, 8, 12, 13, 14, 16, 17, 18, 20, 21, 22, 24, 25];
  const seat2Hand = [1, 9, 28, 29, 30, 32, 33, 34, 36, 37, 38, 40, 41];
  const physical = new Set([7, ...seat1Hand, ...seat2Hand]);
  return {
    config: { rulesetId: "junk" },
    phase: "playing",
    wall: allTileIds().filter((tile) => !physical.has(tile)),
    seats: [
      { hand: [7], melds: [], discards: [] },
      { hand: seat1Hand, melds: [], discards: [] },
      { hand: seat2Hand, melds: [], discards: [] },
      { hand: [], melds: [], discards: [] },
    ],
    currentSeat: 0,
    dealer,
    gangChain: [0, 0, 0, 0],
    seq: 0,
    prng: createPrng(1),
  };
};

test("multi-ron always head-jumps deterministically", () => {
  let state = unwrap(junkRuleSet.applyAction(multiHuState(), 0, { type: "discard", tile: 7 }));
  state = unwrap(junkRuleSet.applyAction(state, 1, { type: "hu" }));
  state = unwrap(junkRuleSet.applyAction(state, 2, { type: "hu" }));
  expect(state.result).toMatchObject({ winner: 1, winners: [1], scoreDeltas: [-8, 8, 0, 0] });
  expect(state.result).toMatchObject({
    winnerDetails: [{ seat: 1, fanTypes: ["menqing", "qingyise"], multiplier: 8, payout: 8 }],
  });
  assertTileConservation(state);
});

test("dealer's flat x2 applies to a payment involving either the payer or the winner (junk.md §3)", () => {
  // dealer=0: the discarder/payer is the dealer.
  let state = unwrap(junkRuleSet.applyAction(multiHuState(0), 0, { type: "discard", tile: 7 }));
  state = unwrap(junkRuleSet.applyAction(state, 1, { type: "hu" }));
  state = unwrap(junkRuleSet.applyAction(state, 2, { type: "hu" }));
  expect(state.result).toMatchObject({ scoreDeltas: [-16, 16, 0, 0] });

  // dealer=1: the winner is the dealer — same doubling, not a compounding x4.
  state = unwrap(junkRuleSet.applyAction(multiHuState(1), 0, { type: "discard", tile: 7 }));
  state = unwrap(junkRuleSet.applyAction(state, 1, { type: "hu" }));
  state = unwrap(junkRuleSet.applyAction(state, 2, { type: "hu" }));
  expect(state.result).toMatchObject({ scoreDeltas: [-16, 16, 0, 0] });
});

test.skip("100 seeded games finish while preserving tile conservation", { tags: ["slow"] }, () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const state = playDeterministically(seed);
    expect(state.result).toBeDefined();
  }
});

test("engine-api createGame/applyAction/getLegalActions/getPlayerView dispatch by rulesetId", () => {
  const started = engineCreateGame({ rulesetId: "junk" }, 7, 0);
  if ("error" in started) throw new Error(started.error.code);
  expect(
    started.events.some(
      (event) => (event.payload as { type?: string }).type === "LegalActionsUpdated",
    ),
  ).toBe(true);
  const state = started.state as JunkState;
  const seat = state.currentSeat;
  expect(engineGetLegalActions(state, seat)).toEqual(junkRuleSet.getLegalActions(state, seat));
  expect(engineGetPlayerView(state, seat)).toEqual(junkRuleSet.getPlayerView(state, seat));
  expect(engineRebuildPlayerView("junk", started.events, seat)).toEqual(
    junkRuleSet.rebuildPlayerView(started.events, seat),
  );
  expect(engineRebuildPlayerView("unknown-ruleset", started.events, seat)).toBeUndefined();
  const tile = state.seats[seat]!.hand[0]!;
  const viaEngine = engineApplyAction(state, seat, { type: "discard", tile });
  const viaRuleSet = junkRuleSet.applyAction(state, seat, { type: "discard", tile });
  expect(viaEngine).toEqual(viaRuleSet);
  expect(
    engineApplyAction({ config: { rulesetId: "unknown-ruleset" } }, 0, { type: "pass" }),
  ).toEqual({ error: { code: "UNKNOWN_RULESET" } });
});
