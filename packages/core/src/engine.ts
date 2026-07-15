import type { SeatId } from "./lib/ids.ts";
import { junkRuleSet } from "./rulesets/junk/index.ts";
import { bloodbattleRuleSet } from "./rulesets/bloodbattle/index.ts";
import type { ApplyResult, GameConfig, PlayerViewBase } from "./types.ts";
import { CORE_ERROR_CODES } from "./errors.ts";

/**
 * Consumer-defined minimal contract: only the four functions the engine-api
 * boundary actually dispatches. A ruleset module is free to expose whatever
 * else it wants (e.g. junkRuleSet.getPlayerView is reused directly by junk
 * tests) — nothing beyond this shape is a public contract.
 */
export type RulesetModule<TState, TAction> = {
  createGame: (seed: number, config?: unknown) => ApplyResult<TState>;
  applyAction: (state: TState, seat: SeatId, action: TAction) => ApplyResult<TState>;
  getLegalActions: (state: TState, seat: SeatId) => readonly TAction[];
  getPlayerView: (state: TState, seat: SeatId) => PlayerViewBase;
};

type StateWithConfig = { config: GameConfig };

// any: registry holds heterogeneous ruleset modules; each entry is concretely
// typed at its own module, the public functions below re-narrow at the boundary.
const rulesets: Record<string, RulesetModule<any, any>> = {
  junk: junkRuleSet,
  bloodbattle: bloodbattleRuleSet,
};

const getRuleset = (rulesetId: string) => rulesets[rulesetId];

export const createGame = (config: GameConfig, seed: number): ApplyResult<unknown> =>
  getRuleset(config.rulesetId)?.createGame(seed, config) ?? {
    error: { code: CORE_ERROR_CODES.unknownRuleset },
  };

/** Public core boundary. Server/UI select no rules: state.config.rulesetId selects the ruleset module. */
export const applyAction = (
  state: StateWithConfig,
  seat: SeatId,
  action: unknown,
): ApplyResult<unknown> =>
  getRuleset(state.config.rulesetId)?.applyAction(state, seat, action) ?? {
    error: { code: CORE_ERROR_CODES.unknownRuleset },
  };

export const getLegalActions = (state: StateWithConfig, seat: SeatId): readonly unknown[] =>
  getRuleset(state.config.rulesetId)?.getLegalActions(state, seat) ?? [];

export const getPlayerView = (state: StateWithConfig, seat: SeatId): PlayerViewBase | undefined =>
  getRuleset(state.config.rulesetId)?.getPlayerView(state, seat);
