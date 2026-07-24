import { assertTileConservation } from "../../lib/invariants.ts";
import { STANDARD_TILE_SET } from "../../lib/tiles.ts";
import { EVENT_TYPES, type GameEvent } from "../../events.ts";
import type { RulesetModule } from "../../engine.ts";
import { parseJunkConfig } from "./config.ts";
import {
  applyAnGang,
  applyBuGang,
  applyDiscard,
  appendEvent,
  cloneState,
  computeNextJunkDealer,
  createJunkGame,
  fail,
  finishWin,
  isWin,
  sameKind,
  seatVisibility,
} from "./state-machine.ts";
import { applyClaimResponse } from "./claims.ts";
import { getPlayerView, rebuildPlayerView } from "./view.ts";
import type { JunkAction, JunkApplyResult, JunkState } from "./types.ts";

export { DEFAULT_JUNK_CONFIG, parseJunkConfig } from "./config.ts";
export { computeNextJunkDealer, createJunkGame } from "./state-machine.ts";
export { getPlayerView } from "./view.ts";
export type {
  JunkAction,
  JunkApplyResult,
  JunkClaimAction,
  JunkClaimOption,
  JunkConfig,
  JunkGameResult,
  JunkPendingClaims,
  JunkPhase,
  JunkPlayerView,
  JunkState,
} from "./types.ts";

export const junkRuleSet: RulesetModule<JunkState, JunkAction> = {
  createGame: (config, dealer) => {
    const result = createJunkGame(config, dealer);
    if ("state" in result) appendLegalActions(result.state, result.events);
    return result;
  },
  computeNextDealer: computeNextJunkDealer,
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
    const actions: JunkAction[] = hand.map((tile) => ({ type: "discard", tile }));
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
  applyAction: (input, seat, action) => {
    const state = cloneState(input);
    const events: GameEvent[] = [];
    let result: JunkApplyResult;
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
    if ("state" in result) {
      appendLegalActions(result.state, result.events);
      assertTileConservation(result.state);
    }
    return result;
  },
  getPlayerView: (state, seat) => ({
    ...getPlayerView(state, seat),
    myActionOptions: junkRuleSet.getLegalActions(state, seat),
  }),
  rebuildPlayerView,
};

function appendLegalActions(state: JunkState, events: GameEvent[]): void {
  for (const seat of [0, 1, 2, 3] as const) {
    appendEvent(state, events, seatVisibility(seat), {
      type: EVENT_TYPES.legalActionsUpdated,
      actions: junkRuleSet.getLegalActions(state, seat),
    });
  }
}
