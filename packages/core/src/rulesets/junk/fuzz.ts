import { createPrng, nextInt, type PrngState } from "@/lib/prng.ts";
import type { SeatId } from "@/lib/ids.ts";
import type { GameEvent } from "@/events.ts";
import { junkRuleSet } from "./index.ts";
import type { JunkAction, JunkConfig, JunkState } from "./index.ts";

export type PlayedGame = {
  state: JunkState;
  events: GameEvent[];
  actions: Array<{ seat: SeatId; action: JunkAction }>;
};

export type FuzzFailure = {
  seed: number;
  config: Partial<Omit<JunkConfig, "rulesetId">>;
  actions: Array<{ seat: SeatId; action: JunkAction }>;
  error: string;
};

const nextAction = (
  state: JunkState,
  prng: PrngState,
): { seat: SeatId; action: JunkAction; prng: PrngState } | undefined => {
  const eligible =
    state.phase === "awaiting-claims"
      ? ([0, 1, 2, 3] as SeatId[]).filter(
          (seat) => junkRuleSet.getLegalActions(state, seat).length > 0,
        )
      : [state.currentSeat];
  if (eligible.length === 0) return undefined;
  const seatPick = nextInt(prng, eligible.length);
  const seat = eligible[seatPick.value] as SeatId;
  const actions = junkRuleSet.getLegalActions(state, seat);
  const actionPick = nextInt(seatPick.prng, actions.length);
  return { seat, action: actions[actionPick.value] as JunkAction, prng: actionPick.prng };
};

/** Runs a complete game from serializable inputs; it performs no I/O. */
export const playJunkGame = (
  seed: number,
  config: Partial<Omit<JunkConfig, "rulesetId">> = {},
  actionLog: Array<{ seat: SeatId; action: JunkAction }> = [],
): PlayedGame | FuzzFailure => {
  const started = junkRuleSet.createGame(seed, config);
  if ("error" in started) return { seed, config, actions: [], error: started.error.code };
  let state = started.state;
  const events = [...started.events];
  const actions: Array<{ seat: SeatId; action: JunkAction }> = [];
  let prng = createPrng(seed ^ 0x9e37_79b9);
  for (let step = 0; step < 500 && state.phase !== "finished"; step += 1) {
    const logged = actionLog[step];
    const selected = logged ? { ...logged, prng } : nextAction(state, prng);
    if (!selected) return { seed, config, actions, error: "NO_LEGAL_ACTION" };
    prng = selected.prng;
    const result = junkRuleSet.applyAction(state, selected.seat, selected.action);
    actions.push({ seat: selected.seat, action: selected.action });
    if ("error" in result) return { seed, config, actions, error: result.error.code };
    state = result.state;
    events.push(...result.events);
  }
  return state.phase === "finished"
    ? { state, events, actions }
    : { seed, config, actions, error: "STEP_LIMIT_EXCEEDED" };
};

// --ruleset-parameterized fuzz entry point is future work — only junk has a
// full applyAction/getLegalActions/createGame trio today (see rulesets/junk/index.ts).
export const fuzzJunkGames = (games: number, seed = 1): FuzzFailure | undefined => {
  let prng = createPrng(seed);
  for (let index = 0; index < games; index += 1) {
    const gameSeed = nextInt(prng, 0x1_0000_0000);
    prng = gameSeed.prng;
    const switches = nextInt(prng, 8);
    prng = switches.prng;
    const config = {
      sevenPairs: (switches.value & 1) !== 0,
      robKong: (switches.value & 2) !== 0,
      multiHuPolicy: (switches.value & 4) !== 0 ? ("all" as const) : ("headJump" as const),
    };
    const result = playJunkGame(gameSeed.value, config);
    if ("error" in result) return result;
  }
  return undefined;
};
