import type { GameEvent } from "./events.ts";
import type { SeatId } from "./lib/ids.ts";
import type { ApplyResult, GameConfig, PlayerViewBase } from "./types.ts";
import { CORE_ERROR_CODES } from "./errors.ts";
import { getRuleset } from "./ruleset-registry.ts";

/** engine-api 分发的六个规则集能力；除此之外的玩法导出不构成公共契约。 */
export type RulesetModule<TState, TAction, TView = PlayerViewBase> = {
  /** Deterministic, ruleset-owned choice for a session's first dealer. */
  computeInitialDealer: (seed: number) => SeatId;
  createGame: (seed: number, dealer: SeatId, config?: unknown) => ApplyResult<TState>;
  applyAction: (state: TState, seat: SeatId, action: TAction) => ApplyResult<TState>;
  getLegalActions: (state: TState, seat: SeatId) => readonly TAction[];
  getPlayerView: (state: TState, seat: SeatId) => TView;
  /** 根据刚结束的一局决定下一局庄家；公式属于玩法规则，不能由房间层假定顺时针。 */
  computeNextDealer: (finishedState: TState, currentDealer: SeatId) => SeatId;
  /** 从历史事件重建座位视图；事件 payload 的解释是玩法私有的，故必须按 ruleset 分发。 */
  rebuildPlayerView: (events: readonly GameEvent[], seat: SeatId) => TView;
};

type StateWithConfig = { config: GameConfig };

export const computeInitialDealer = (config: GameConfig, seed: number): SeatId =>
  getRuleset(config.rulesetId)?.computeInitialDealer(seed) ?? 0;

export const createGame = (
  config: GameConfig,
  seed: number,
  dealer: SeatId,
): ApplyResult<unknown> =>
  getRuleset(config.rulesetId)?.createGame(seed, dealer, config) ?? {
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

export const computeNextDealer = (state: StateWithConfig, currentDealer: SeatId): SeatId =>
  getRuleset(state.config.rulesetId)?.computeNextDealer(state, currentDealer) ?? currentDealer;

/** Dispatches by rulesetId (no state to read it from — replay has no live state). */
export const rebuildPlayerView = (
  rulesetId: string,
  events: readonly GameEvent[],
  seat: SeatId,
): PlayerViewBase | undefined => getRuleset(rulesetId)?.rebuildPlayerView(events, seat);
