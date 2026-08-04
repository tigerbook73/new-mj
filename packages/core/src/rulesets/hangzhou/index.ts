import { assertTileConservation } from "../../lib/invariants.ts";
import { STANDARD_TILE_SET } from "../../lib/tiles.ts";
import { SEAT_IDS } from "../../lib/seats.ts";
import type { GameEvent } from "../../events.ts";
import type { RulesetModule } from "../../engine.ts";
import { CORE_ERROR_CODES } from "../../errors.ts";
import { CAISHEN_KIND } from "./constants.ts";
import { HANGZHOU_EVENT_TYPES as EVENT_TYPES } from "./events.ts";
import { parseHangzhouConfig } from "./config.ts";
import {
  applyAnGang,
  applyBuGang,
  applyDiscard,
  applyDrawAction,
  appendEvent,
  canZimo,
  cloneState,
  computeNextHangzhouDealer,
  createHangzhouGame,
  fail,
  finishWin,
  sameKind,
  seatVisibility,
} from "./state-machine.ts";
import { applyClaimResponse } from "./claims.ts";
import { getPlayerView, rebuildPlayerView } from "./view.ts";
import type {
  HangzhouAction,
  HangzhouApplyResult,
  HangzhouEventPayload,
  HangzhouState,
} from "./types.ts";

export { DEFAULT_HANGZHOU_CONFIG, parseHangzhouConfig } from "./config.ts";
export { computeNextHangzhouDealer, createHangzhouGame } from "./state-machine.ts";
export { getPlayerView } from "./view.ts";
export { CAISHEN_KIND } from "./constants.ts";
export { scoreHangzhouHand } from "./scoring.ts";
export type {
  HangzhouScoringInput,
  HangzhouScoringMeld,
  HangzhouScoringResult,
} from "./scoring.ts";
export type {
  HangzhouAction,
  HangzhouApplyResult,
  HangzhouClaimAction,
  HangzhouClaimOption,
  HangzhouConfig,
  HangzhouGameResult,
  HangzhouPendingClaims,
  HangzhouPhase,
  HangzhouPlayerView,
  HangzhouState,
  HangzhouWinDetail,
} from "./types.ts";

export const hangzhouRuleSet: RulesetModule<HangzhouState, HangzhouAction> = {
  computeInitialDealer: () => 0,
  createGame: (seed, dealer, config) => {
    const result = createHangzhouGame(seed, dealer, config);
    if ("state" in result) appendLegalActions(result.state, result.events);
    return result;
  },
  computeNextDealer: computeNextHangzhouDealer,
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
    const isRestricted =
      state.caishenLockout !== undefined && seat !== state.caishenLockout.discarder;
    const hand = state.seats[seat]!.hand;
    let actions: HangzhouAction[] = [];
    if (isRestricted && state.justDrawn?.seat === seat) {
      actions.push({ type: "discard", tile: state.justDrawn.tile });
    } else {
      actions = hand.map((tile) => ({ type: "discard", tile }));
    }
    // Caishen can never be gang'd, even concealed — see hangzhou.md §2.
    for (const kind of STANDARD_TILE_SET.kinds) {
      if (kind === CAISHEN_KIND) continue;
      if (sameKind(hand, kind).length === 4) actions.push({ type: "anGang", kind });
    }
    if (!isRestricted) {
      for (const meld of state.seats[seat]!.melds) {
        if (meld.type !== "peng") continue;
        const kind = STANDARD_TILE_SET.kindOf(meld.tiles[0]!);
        const tile = sameKind(hand, kind)[0];
        if (tile !== undefined) actions.push({ type: "buGang", tile });
      }
    }
    if (canZimo(state, seat)) actions.push({ type: "zimo" });
    return actions;
  },
  applyAction: (input, seat, action) => {
    const state = cloneState(input);
    const events: GameEvent<HangzhouEventPayload>[] = [];
    let result: HangzhouApplyResult;
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
              finishWin(state, events, seat);
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
    myActionOptions: hangzhouRuleSet.getLegalActions(state, seat),
  }),
  // RulesetModule's boundary type is untyped GameEvent[] since engine.ts dispatches
  // across heterogeneous rulesets; hangzhou's own payload union is only meaningful
  // once narrowed back to this ruleset, which is what rebuildPlayerView does internally.
  rebuildPlayerView: (events, seat) =>
    rebuildPlayerView(events as GameEvent<HangzhouEventPayload>[], seat),
};

function appendLegalActions(state: HangzhouState, events: GameEvent<HangzhouEventPayload>[]): void {
  for (const seat of SEAT_IDS) {
    appendEvent(state, events, seatVisibility(seat), {
      type: EVENT_TYPES.legalActionsUpdated,
      actions: hangzhouRuleSet.getLegalActions(state, seat),
    });
  }
}
