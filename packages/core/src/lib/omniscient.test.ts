import { expect, test } from "vitest";
import {
  DEFAULT_BLOODBATTLE_CONFIG,
  createBloodbattlePrelude,
  createJunkGame,
  getOmniscientView,
  type SeatState,
} from "../index.ts";

const emptySeats = (hands: number[][]): SeatState[] =>
  hands.map((hand) => ({ hand, melds: [], discards: [] }));

test("returns the wall and each seat's hand as a defensive copy", () => {
  const state = {
    wall: [10, 11, 12],
    seats: emptySeats([[0, 1], [2], [], [3, 4, 5]]),
  };
  const view = getOmniscientView(state);
  expect(view.wall).toEqual([10, 11, 12]);
  expect(view.hands).toEqual([[0, 1], [2], [], [3, 4, 5]]);

  state.wall.push(99);
  state.seats[0]!.hand.push(99);
  expect(view.wall).toEqual([10, 11, 12]);
  expect(view.hands[0]).toEqual([0, 1]);
});

test("empty wall (drawn out) still returns all four hands", () => {
  const state = { wall: [], seats: emptySeats([[1], [2], [3], [4]]) };
  const view = getOmniscientView(state);
  expect(view.wall).toEqual([]);
  expect(view.hands).toHaveLength(4);
});

test("junk: generic function works on a real junk game state", () => {
  const started = createJunkGame(1, 0);
  if ("error" in started) throw new Error(started.error.code);
  const view = getOmniscientView(started.state);
  expect(view.wall).toEqual(started.state.wall);
  expect(view.hands).toEqual(started.state.seats.map((seat) => seat.hand));
});

test("bloodbattle: generic function works on a real bloodbattle game state", () => {
  const started = createBloodbattlePrelude(1, 0, DEFAULT_BLOODBATTLE_CONFIG);
  if ("error" in started) throw new Error(started.error.code);
  const view = getOmniscientView(started.state);
  expect(view.wall).toEqual(started.state.wall);
  expect(view.hands).toEqual(started.state.seats.map((seat) => seat.hand));
});
