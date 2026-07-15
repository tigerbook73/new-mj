import { assertTileConservation } from "../../lib/invariants.ts";
import { STANDARD_TILE_SET } from "../../lib/tiles.ts";
import type { ClaimResolution, RuleSet, RuleSetApplyResult } from "../../ruleset.ts";
import type { Action, GameEvent, GameState, SeatId } from "../../types.ts";
import { parseJunkConfig } from "./config.ts";
import {
  applyAnGang,
  applyBuGang,
  applyDiscard,
  cloneState,
  createJunkGame,
  fail,
  finishWin,
  isWin,
  sameKind,
} from "./state-machine.ts";
import { applyClaimResponse, chooseClaims } from "./claims.ts";
import { getPlayerView } from "./view.ts";

export { DEFAULT_JUNK_CONFIG, parseJunkConfig } from "./config.ts";
export { createJunkGame } from "./state-machine.ts";
export { getPlayerView, rebuildPlayerView } from "./view.ts";

export const junkRuleSet: RuleSet = {
  id: "junk",
  tileSet: STANDARD_TILE_SET,
  phases: [
    { id: "dealing", next: ["playing"] },
    { id: "playing", next: ["awaiting-claims", "finished"] },
    { id: "awaiting-claims", next: ["playing", "finished"] },
    { id: "finished", next: [] },
  ],
  parseConfig: parseJunkConfig,
  getLegalActions: (state, seat) => {
    if (state.phase === "awaiting-claims") {
      const options = state.pendingClaims?.options[seat] ?? [];
      if (state.pendingClaims?.responses[seat]) return [];
      return options.length > 0
        ? [...options.map((option) => option.action), { type: "pass" }]
        : [];
    }
    if (state.phase !== "playing" || state.currentSeat !== seat) return [];
    const hand = state.seats[seat]!.hand;
    const actions: Action[] = hand.map((tile) => ({ type: "discard", tile }));
    for (const kind of STANDARD_TILE_SET.kinds) {
      if (sameKind(hand, kind).length === 4) actions.push({ type: "anGang", kind });
    }
    for (const meld of state.seats[seat]!.melds) {
      if (meld.type !== "peng") continue;
      const kind = STANDARD_TILE_SET.kindOf(meld.tiles[0]!);
      const tile = sameKind(hand, kind)[0];
      if (tile !== undefined) actions.push({ type: "buGang", tile });
    }
    if (isWin(state, seat)) actions.push({ type: "zimo" });
    return actions;
  },
  getClaimOptions: (state, seat) => state.pendingClaims?.options[seat] ?? [],
  applyAction: (input, seat, action) => {
    const state = cloneState(input);
    const events: GameEvent[] = [];
    let result: RuleSetApplyResult;
    if (action.type === "discard") result = applyDiscard(state, seat, action.tile, events);
    else if (["chi", "peng", "minGang", "hu", "pass"].includes(action.type))
      result = applyClaimResponse(state, seat, action, events);
    else if (action.type === "anGang") result = applyAnGang(state, seat, action.kind, events);
    else if (action.type === "buGang") result = applyBuGang(state, seat, action.tile, events);
    else if (action.type === "zimo") {
      result =
        state.phase !== "playing" || state.currentSeat !== seat || !isWin(state, seat)
          ? fail("ZIMO_NOT_AVAILABLE")
          : (() => {
              finishWin(state, events, seat, "zimo");
              return { state, events };
            })();
    } else result = fail("UNKNOWN_ACTION");
    if ("state" in result) assertTileConservation(result.state);
    return result;
  },
  resolveClaims: (state): ClaimResolution | undefined => {
    if (!state.pendingClaims) return undefined;
    const choice = chooseClaims(state)[0];
    return choice ? { type: "claimed", ...choice } : { type: "unclaimed" };
  },
  evaluateWin: (state, seat) => ({ isWin: isWin(state, seat) }),
  settle: (state) => ({ scoreDeltas: state.result?.scoreDeltas ?? [0, 0, 0, 0] }),
};
