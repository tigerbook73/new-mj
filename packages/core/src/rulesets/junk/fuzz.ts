import { createPrng, nextInt, type PrngState } from "../../lib/prng.ts";
import { STANDARD_TILE_SET } from "../../lib/tiles.ts";
import type { SeatId } from "../../lib/ids.ts";
import { SEAT_COUNT, SEAT_IDS } from "../../lib/seats.ts";
import type { GameEvent } from "../../events.ts";
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
      ? SEAT_IDS.filter((seat) => junkRuleSet.getLegalActions(state, seat).length > 0)
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
  dealer: SeatId = 0,
): PlayedGame | FuzzFailure => {
  const started = junkRuleSet.createGame(seed, dealer, config);
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

/** Every winner's winSnapshot must exist and its concealed decomposition must be
 * exactly the same tile-kind multiset as the concealed hand it was carved from —
 * a decompose bug would either drop this or return a mismatched shape. */
const checkWinSnapshotInvariant = (state: JunkState): string | undefined => {
  if (state.result?.type !== "win") return undefined;
  for (const winner of state.result.winners) {
    const snapshot = state.wins?.[winner];
    if (!snapshot) return "WIN_SNAPSHOT_MISSING";
    const flatGroups = [...snapshot.groups.flat()].sort().join(",");
    const flatHand = snapshot.hand
      .map((tile) => STANDARD_TILE_SET.kindOf(tile))
      .sort()
      .join(",");
    if (flatGroups !== flatHand) return "WIN_SNAPSHOT_MISMATCH";
  }
  return undefined;
};

/** Every payout is a zero-sum transfer between seats — a bug in the dealer's
 * flat ×2 (double-counting or dropping an edge) would break this. */
const checkScoreDeltasInvariant = (state: JunkState): string | undefined => {
  if (!state.result) return undefined;
  const sum = state.result.scoreDeltas.reduce((total, delta) => total + delta, 0);
  return sum === 0 ? undefined : "SCORE_DELTAS_NOT_ZERO_SUM";
};

// --ruleset-parameterized fuzz entry point is future work — only junk has a
// full applyAction/getLegalActions/createGame trio today (see rulesets/junk/index.ts).
export const fuzzJunkGames = (games: number, seed = 1): FuzzFailure | undefined => {
  let prng = createPrng(seed);
  for (let index = 0; index < games; index += 1) {
    const gameSeed = nextInt(prng, 0x1_0000_0000);
    prng = gameSeed.prng;
    const dealerPick = nextInt(prng, SEAT_COUNT);
    prng = dealerPick.prng;
    const result = playJunkGame(gameSeed.value, {}, [], dealerPick.value as SeatId);
    if ("error" in result) return result;
    const invariantError =
      checkWinSnapshotInvariant(result.state) ?? checkScoreDeltasInvariant(result.state);
    if (invariantError) {
      return { seed: gameSeed.value, config: {}, actions: result.actions, error: invariantError };
    }
  }
  return undefined;
};
