import { junkRuleSet } from "./rules/junk.ts";
import type { RuleSet, RuleSetApplyResult } from "./ruleset.ts";
import type { Action, GameState, SeatId } from "./types.ts";

const ruleSets: Record<string, RuleSet> = {
  junk: junkRuleSet,
};

export const getRuleSet = (rulesetId: string): RuleSet | undefined => ruleSets[rulesetId];

/** Public core boundary. Server/UI select no rules: GameState.config selects the RuleSet. */
export const applyAction = (state: GameState, seat: SeatId, action: Action): RuleSetApplyResult => {
  const ruleSet = getRuleSet(state.config.rulesetId);
  return ruleSet
    ? ruleSet.applyAction(state, seat, action)
    : { error: { code: "UNKNOWN_RULESET" } };
};

export const getLegalActions = (state: GameState, seat: SeatId): readonly Action[] =>
  getRuleSet(state.config.rulesetId)?.getLegalActions(state, seat) ?? [];
