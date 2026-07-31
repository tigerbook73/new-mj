import { createPrng, nextInt, type PrngState } from "../../lib/prng.ts";
import type { SeatId } from "../../lib/ids.ts";
import type { GameEvent } from "../../events.ts";
import { hangzhouRuleSet } from "./index.ts";
import type { HangzhouAction, HangzhouConfig, HangzhouState } from "./index.ts";

export type PlayedHangzhouGame = {
  state: HangzhouState;
  events: GameEvent[];
  actions: Array<{ seat: SeatId; action: HangzhouAction }>;
};

export type HangzhouFuzzFailure = {
  seed: number;
  config: Partial<Omit<HangzhouConfig, "rulesetId">>;
  actions: Array<{ seat: SeatId; action: HangzhouAction }>;
  error: string;
};

const nextAction = (
  state: HangzhouState,
  prng: PrngState,
): { seat: SeatId; action: HangzhouAction; prng: PrngState } | undefined => {
  const eligible =
    state.phase === "awaiting-claims"
      ? ([0, 1, 2, 3] as SeatId[]).filter(
          (seat) => hangzhouRuleSet.getLegalActions(state, seat).length > 0,
        )
      : [state.currentSeat];
  if (eligible.length === 0) return undefined;
  const seatPick = nextInt(prng, eligible.length);
  const seat = eligible[seatPick.value] as SeatId;
  const actions = hangzhouRuleSet.getLegalActions(state, seat);
  const actionPick = nextInt(seatPick.prng, actions.length);
  return { seat, action: actions[actionPick.value] as HangzhouAction, prng: actionPick.prng };
};

/** Runs a complete game from serializable inputs; it performs no I/O. */
export const playHangzhouGame = (
  seed: number,
  config: Partial<Omit<HangzhouConfig, "rulesetId">> = {},
  actionLog: Array<{ seat: SeatId; action: HangzhouAction }> = [],
  dealer: SeatId = 0,
): PlayedHangzhouGame | HangzhouFuzzFailure => {
  const started = hangzhouRuleSet.createGame(seed, dealer, config);
  if ("error" in started) return { seed, config, actions: [], error: started.error.code };
  let state = started.state;
  const events = [...started.events];
  const actions: Array<{ seat: SeatId; action: HangzhouAction }> = [];
  let prng = createPrng(seed ^ 0x9e37_79b9);
  for (let step = 0; step < 500 && state.phase !== "finished"; step += 1) {
    const logged = actionLog[step];
    const selected = logged ? { ...logged, prng } : nextAction(state, prng);
    if (!selected) return { seed, config, actions, error: "NO_LEGAL_ACTION" };
    prng = selected.prng;
    const result = hangzhouRuleSet.applyAction(state, selected.seat, selected.action);
    actions.push({ seat: selected.seat, action: selected.action });
    if ("error" in result) return { seed, config, actions, error: result.error.code };
    state = result.state;
    events.push(...result.events);
  }
  return state.phase === "finished"
    ? { state, events, actions }
    : { seed, config, actions, error: "STEP_LIMIT_EXCEEDED" };
};

export const fuzzHangzhouGames = (games: number, seed = 1): HangzhouFuzzFailure | undefined => {
  let prng = createPrng(seed);
  for (let index = 0; index < games; index += 1) {
    const gameSeed = nextInt(prng, 0x1_0000_0000);
    prng = gameSeed.prng;
    const switches = nextInt(prng, 2);
    prng = switches.prng;
    const dealerPick = nextInt(prng, 4);
    prng = dealerPick.prng;
    // dealerStreak randomized across [1,4] so both the santiao-blocked (<3)
    // and unlocked (>=3) ron paths get fuzzed — see hangzhou.md §5.
    const streakPick = nextInt(prng, 4);
    prng = streakPick.prng;
    const config = {
      multiHuPolicy: (switches.value & 1) !== 0 ? ("all" as const) : ("headJump" as const),
      dealerStreak: streakPick.value + 1,
    };
    const result = playHangzhouGame(gameSeed.value, config, [], dealerPick.value as SeatId);
    if ("error" in result) return result;
  }
  return undefined;
};
