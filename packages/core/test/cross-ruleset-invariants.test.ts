import { expect, test } from "vitest";
import { REGISTERED_RULESETS_FOR_TESTING } from "@/support/registered-rulesets";

// "Event reconstruction ≡ direct derivation" (decisions.md G) is a core
// invariant, not a junk-specific one — parameterized so a second ruleset
// only needs to be added to the registry, not re-authored here.
for (const ruleset of REGISTERED_RULESETS_FOR_TESTING) {
  test(`${ruleset.id}: filtered events rebuild the same initial player view as direct derivation`, () => {
    const started = ruleset.createGame(19);
    if ("error" in started) throw new Error(started.error.code);
    for (const seat of [0, 1, 2, 3] as const) {
      expect(ruleset.rebuildPlayerView(started.events, seat)).toEqual(
        ruleset.getPlayerView(started.state, seat),
      );
    }
  });

  test(`${ruleset.id}: filtered event replay remains equal to direct views through gameplay`, () => {
    const started = ruleset.createGame(23);
    if ("error" in started) throw new Error(started.error.code);
    let state = started.state;
    const events = [...started.events];
    for (let step = 0; step < 30 && state.phase !== "finished"; step += 1) {
      const seat =
        state.phase === "awaiting-claims"
          ? ([0, 1, 2, 3] as const).find(
              (candidate) => ruleset.getLegalActions(state, candidate).length > 0,
            )!
          : state.currentSeat;
      const action = ruleset.getLegalActions(state, seat)[0]!;
      const result = ruleset.applyAction(state, seat, action);
      if ("error" in result) throw new Error(result.error.code);
      state = result.state;
      events.push(...result.events);
      for (const viewer of [0, 1, 2, 3] as const) {
        expect(ruleset.rebuildPlayerView(events, viewer)).toEqual(
          ruleset.getPlayerView(state, viewer),
        );
      }
    }
  });
}
