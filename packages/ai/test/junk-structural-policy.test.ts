import {
  createPrng,
  junkRuleSet,
  nextInt,
  SEAT_IDS,
  type JunkAction,
  type JunkPlayerView,
  type SeatId,
} from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { JunkBotAgent } from "../src/junk/bot-agent.ts";
import { recommendJunkAction, recommendStructuralBaselineV4Action } from "../src/junk/strategy.ts";

describe("structural Junk policy against the real core engine", () => {
  it("finishes a hand using only actions returned by core", { tags: ["slow"] }, () => {
    const started = junkRuleSet.createGame(20260816, 0);
    if ("error" in started) throw new Error(started.error.code);
    let state = started.state;
    let prng = createPrng(20260816 ^ 0x9e37_79b9);
    // One JunkBotAgent per seat, held across the whole hand — the only way to exercise
    // whatever rolling state the agent accumulates across consecutive decisions, not just a
    // single isolated call. See packages/ai/AGENTS.md on why this doesn't affect the stateless
    // facade's own determinism (agents are opt-in, caller-owned, checked here for parity only).
    const agents = SEAT_IDS.map(() => new JunkBotAgent());

    for (let step = 0; step < 500 && state.phase !== "finished"; step += 1) {
      const eligible =
        state.phase === "awaiting-claims"
          ? SEAT_IDS.filter((seat) => junkRuleSet.getLegalActions(state, seat).length > 0)
          : [state.currentSeat];
      expect(eligible.length).toBeGreaterThan(0);
      const seatPick = nextInt(prng, eligible.length);
      prng = seatPick.prng;
      const seat = eligible[seatPick.value] as SeatId;
      const legalActions = junkRuleSet.getLegalActions(state, seat) as JunkAction[];
      expect(legalActions.length).toBeGreaterThan(0);
      const playerView = junkRuleSet.getPlayerView(state, seat) as JunkPlayerView;
      const baselineAction = recommendStructuralBaselineV4Action(playerView, legalActions);
      const action = recommendJunkAction(playerView, legalActions);
      expect(action).toBe(baselineAction);
      expect(action).toBeDefined();
      expect(legalActions).toContain(action);
      const agentAction = agents[seat]!.decide(playerView, legalActions);
      expect(agentAction).toBe(action);
      const result = junkRuleSet.applyAction(state, seat, action!);
      if ("error" in result) throw new Error(`step ${step}: ${result.error.code}`);
      state = result.state;
    }

    expect(state.phase).toBe("finished");
  });
});
