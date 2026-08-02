import { assertTileConservation } from "../../lib/invariants.ts";
import { STANDARD_TILE_SET } from "../../lib/tiles.ts";
import { SEAT_IDS } from "../../lib/seats.ts";
import type { GameEvent } from "../../events.ts";
import type { RulesetModule } from "../../engine.ts";
import { CORE_ERROR_CODES } from "../../errors.ts";
import { parseJunkConfig } from "./config.ts";
import { JUNK_EVENT_TYPES as EVENT_TYPES } from "./events.ts";
import {
  applyAnGang,
  applyBuGang,
  applyDiscard,
  applyDrawAction,
  appendEvent,
  canZimo,
  cloneState,
  computeInitialJunkDealer,
  computeNextJunkDealer,
  createJunkGame,
  fail,
  finishWin,
  sameKind,
  seatVisibility,
} from "./state-machine.ts";
import { applyClaimResponse } from "./claims.ts";
import { getPlayerView, rebuildPlayerView } from "./view.ts";
import type { JunkAction, JunkApplyResult, JunkEventPayload, JunkState } from "./types.ts";

export { DEFAULT_JUNK_CONFIG, parseJunkConfig } from "./config.ts";
export {
  computeInitialJunkDealer,
  computeNextJunkDealer,
  createJunkGame,
} from "./state-machine.ts";
export { getPlayerView } from "./view.ts";
export { scoreJunkHand } from "./scoring.ts";
export type { JunkScoringInput, JunkScoringMeld, JunkScoringResult } from "./scoring.ts";
export type {
  JunkAction,
  JunkApplyResult,
  JunkClaimAction,
  JunkClaimOption,
  JunkConfig,
  JunkGameResult,
  JunkWinnerDetail,
  JunkPendingClaims,
  JunkPhase,
  JunkPlayerView,
  JunkState,
} from "./types.ts";

export const junkRuleSet: RulesetModule<JunkState, JunkAction> = {
  computeInitialDealer: computeInitialJunkDealer,
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
    if (state.phase === "awaiting-draw") {
      return state.currentSeat === seat ? [{ type: "draw" }] : [];
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
    if (canZimo(state, seat)) actions.push({ type: "zimo" });
    return actions;
  },
  applyAction: (input, seat, action) => {
    const state = cloneState(input);
    const events: GameEvent<JunkEventPayload>[] = [];
    let result: JunkApplyResult;
    if (action.type === "discard") result = applyDiscard(state, seat, action.tile, events);
    else if (["chi", "peng", "minGang", "hu", "pass"].includes(action.type))
      result = applyClaimResponse(state, seat, action, events);
    else if (action.type === "anGang") result = applyAnGang(state, seat, action.kind, events);
    else if (action.type === "buGang") result = applyBuGang(state, seat, action.tile, events);
    else if (action.type === "draw") result = applyDrawAction(state, seat, events);
    else if (action.type === "zimo") {
      result =
        state.phase !== "playing" || state.currentSeat !== seat || !canZimo(state, seat)
          ? fail("ZIMO_NOT_AVAILABLE")
          : (() => {
              finishWin(state, events, seat, "zimo");
              return { state, events };
            })();
    } else result = fail(CORE_ERROR_CODES.unknownAction);
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
  // RulesetModule's boundary type is untyped GameEvent[] since engine.ts dispatches
  // across heterogeneous rulesets; junk's own payload union is only meaningful once
  // narrowed back to this ruleset, which is what rebuildPlayerView does internally.
  rebuildPlayerView: (events, seat) =>
    rebuildPlayerView(events as GameEvent<JunkEventPayload>[], seat),
};

function appendLegalActions(state: JunkState, events: GameEvent<JunkEventPayload>[]): void {
  for (const seat of SEAT_IDS) {
    appendEvent(state, events, seatVisibility(seat), {
      type: EVENT_TYPES.legalActionsUpdated,
      actions: junkRuleSet.getLegalActions(state, seat),
    });
  }
}
