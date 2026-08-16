import type { JunkAction, JunkPlayerView } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { recommendJunkAction, recommendStructuralJunkAction } from "./strategy.ts";

const view = (phase: JunkPlayerView["phase"]): JunkPlayerView => ({
  seat: 0,
  currentSeat: 0,
  dealer: 0,
  hand: [],
  seats: [0, 1, 2, 3].map(() => ({ melds: [], discards: [], handCount: 0, justDrawn: false })),
  wallCount: 20,
  phase,
});

describe("recommendStructuralJunkAction", () => {
  it("is the production facade", () => {
    const discard: JunkAction = { type: "discard", tile: 0 };
    const actions = [discard];
    expect(recommendJunkAction(view("playing"), actions)).toBe(
      recommendStructuralJunkAction(view("playing"), actions),
    );
  });

  it("covers empty, draw and winning flow actions", () => {
    expect(recommendStructuralJunkAction(view("finished"), [])).toBeUndefined();
    const draw: JunkAction = { type: "draw" };
    expect(recommendStructuralJunkAction(view("awaiting-draw"), [draw])).toBe(draw);
    const discard: JunkAction = { type: "discard", tile: 0 };
    const zimo: JunkAction = { type: "zimo" };
    expect(recommendStructuralJunkAction(view("playing"), [discard, zimo])).toBe(zimo);
    const pass: JunkAction = { type: "pass" };
    const hu: JunkAction = { type: "hu" };
    expect(recommendStructuralJunkAction(view("awaiting-claims"), [pass, hu])).toBe(hu);
  });

  it("returns one of the supplied actions for claim and turn contexts", () => {
    const pass: JunkAction = { type: "pass" };
    expect(recommendStructuralJunkAction(view("awaiting-claims"), [pass])).toBe(pass);

    const discard: JunkAction = { type: "discard", tile: 0 };
    expect(recommendStructuralJunkAction(view("playing"), [discard])).toBe(discard);
  });
});
