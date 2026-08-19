import { tileIdOf, type JunkAction, type JunkPlayerView, type TileKind } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { JunkBotAgent } from "./bot-agent.ts";
import { recommendStructuralBaselineV3Action } from "./structural-baseline.ts";

const ids = (kinds: readonly TileKind[]) => {
  const copies = new Map<TileKind, number>();
  return kinds.map((kind) => {
    const copy = copies.get(kind) ?? 0;
    copies.set(kind, copy + 1);
    return tileIdOf(kind, copy);
  });
};

const turnView = (hand: readonly TileKind[]): JunkPlayerView => ({
  seat: 0,
  hand: ids(hand),
  wallCount: 50,
  currentSeat: 0,
  dealer: 0,
  phase: "playing",
  seats: [0, 1, 2, 3].map((seat) => ({
    handCount: seat === 0 ? hand.length : 13,
    melds: [],
    discards: [],
    justDrawn: seat === 0,
  })),
});

const discards = (hand: readonly TileKind[]): JunkAction[] =>
  ids(hand).map((tile) => ({ type: "discard", tile }));

describe("JunkBotAgent", () => {
  it("returns the same action as the stateless facade and records a turn snapshot", () => {
    const hand: readonly TileKind[] = [
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "7m",
      "8m",
      "9m",
      "1p",
      "2p",
      "3p",
      "9s",
      "9s",
    ];
    const view = turnView(hand);
    const legalActions = discards(hand);
    const expected = recommendStructuralBaselineV3Action(view, legalActions);

    const agent = new JunkBotAgent();
    expect(agent.snapshot).toBeNull();
    const action = agent.decide(view, legalActions);

    expect(action).toEqual(expected);
    expect(agent.snapshot).toMatchObject({
      strategyId: "structural-baseline",
      strategyVersion: 3,
      decisionKind: "turn",
      lastAction: action,
    });
    expect(agent.snapshot?.candidateCount).toBeGreaterThan(0);
    expect(agent.snapshot?.decisionDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("records a claim snapshot when the claim reaches tenpai", () => {
    const view: JunkPlayerView = {
      seat: 0,
      hand: ids(["2m", "3m", "4m", "5m", "6m", "7m", "8p", "8p", "3s", "3s", "6s", "7s", "1z"]),
      wallCount: 50,
      currentSeat: 0,
      dealer: 0,
      phase: "awaiting-claims",
      lastDiscard: { seat: 1, tile: tileIdOf("3s", 2) },
      seats: [0, 1, 2, 3].map(() => ({ handCount: 13, melds: [], discards: [], justDrawn: false })),
    };
    const legalActions: JunkAction[] = [{ type: "peng" }, { type: "pass" }];

    const agent = new JunkBotAgent();
    const action = agent.decide(view, legalActions);

    expect(action).toEqual({ type: "peng" });
    expect(agent.snapshot).toMatchObject({ decisionKind: "claim", candidateCount: 2 });
    expect(agent.snapshot?.searchedCandidateCount).toBeNull();
  });

  it("decides zimo/hu/draw without a diagnostics snapshot", () => {
    const view = turnView(["1m", "2m", "3m"]);
    const zimo: JunkAction = { type: "zimo" };

    const agent = new JunkBotAgent();
    const action = agent.decide(view, [zimo, { type: "discard", tile: view.hand[0]! }]);

    expect(action).toEqual(zimo);
    expect(agent.snapshot).toMatchObject({ decisionKind: null, lastAction: zimo });
  });

  it("throws when there are no legal actions, mirroring chooseJunkAction", () => {
    const agent = new JunkBotAgent();
    expect(() => agent.decide(turnView([]), [])).toThrow();
  });
});
