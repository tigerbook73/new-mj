import { expect, test } from "vitest";
import { createPrng, junkRuleSet, type GameState } from "../src/index.ts";

const state: GameState = {
  config: { rulesetId: "junk" },
  phase: "playing",
  wall: [],
  seats: [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] })),
  currentSeat: 0,
  seq: 0,
  prng: createPrng(1),
  variantState: {},
};

// This is intentionally red until Step 3's candidate interface is approved and
// Step 4 fills in junk behavior. `fails` keeps the repository's test command green.
test.fails("junk happy path accepts a legal discard and emits an event", () => {
  const result = junkRuleSet.applyAction(state, 0, { type: "discard", tile: 0 });
  expect(result).toMatchObject({
    state: expect.anything(),
    events: [expect.objectContaining({ payload: expect.objectContaining({ type: "TileDiscarded" }) })],
  });
});
