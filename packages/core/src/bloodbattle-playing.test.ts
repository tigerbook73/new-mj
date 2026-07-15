import { expect, test } from "vitest";
import {
  allTileIds,
  applyAction,
  createGame,
  createPrng,
  getLegalActions,
  type BloodbattleState,
} from "./index.ts";
import { BLOODBATTLE_TILE_SET } from "./rulesets/bloodbattle/prelude.ts";

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
  expect(getLegalActions(state, 0)).toEqual([
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
