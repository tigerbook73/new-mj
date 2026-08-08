import {
  createPrng,
  junkRuleSet,
  nextInt,
  nextUint32,
  SEAT_IDS,
  type JunkAction,
  type JunkPlayerView,
  type JunkState,
  type PrngState,
  type SeatId,
} from "@new-mj/core";
import { chooseJunkAction, type JunkStrengthConfig, type JunkWeights } from "./strategy.ts";

/** Per-seat decision function; a self-play arena plugs in one per seat so different
 * seats can play at different strength or with different tuned weights. */
export type SeatPolicy = (view: JunkPlayerView, legalActions: readonly JunkAction[]) => JunkAction;

/** Wraps a strength config (and optional weight override) as a SeatPolicy backed by
 * the production decision function; omitting `weights` uses DEFAULT_JUNK_WEIGHTS. */
export const strengthPolicy =
  (strength: JunkStrengthConfig = {}, weights?: JunkWeights): SeatPolicy =>
  (view, legalActions) =>
    chooseJunkAction(view, legalActions, strength, weights);

export type JunkMatchResult = {
  /** Cumulative score deltas across all played hands, one per seat. */
  scores: [number, number, number, number];
  /** Seats ordered best to worst by final score; stable on ties (lower seat index wins). */
  ranking: SeatId[];
};

export type JunkMatchFailure = { seed: number; error: string };

type SeatPolicies = readonly [SeatPolicy, SeatPolicy, SeatPolicy, SeatPolicy];

/** Same eligible-seat selection as core's own fuzz driver (rulesets/junk/fuzz.ts):
 * during awaiting-claims, several seats may have a legal response and one is picked
 * at random to act next (real submission order, not a strategic choice); every other
 * phase has exactly one seat on turn. The seat's own SeatPolicy decides its action. */
const nextMatchAction = (
  state: JunkState,
  policies: SeatPolicies,
  prng: PrngState,
): { seat: SeatId; action: JunkAction; prng: PrngState } | undefined => {
  // Populated during the awaiting-claims eligibility scan so the chosen seat's
  // legal actions aren't computed twice (once to check eligibility, once to act).
  const legalActionsBySeat = new Map<SeatId, JunkAction[]>();
  const eligible: SeatId[] =
    state.phase === "awaiting-claims"
      ? SEAT_IDS.filter((seat) => {
          const actions = junkRuleSet.getLegalActions(state, seat) as JunkAction[];
          legalActionsBySeat.set(seat, actions);
          return actions.length > 0;
        })
      : [state.currentSeat];
  if (eligible.length === 0) return undefined;
  const seatPick = nextInt(prng, eligible.length);
  const seat = eligible[seatPick.value] as SeatId;
  const legalActions =
    legalActionsBySeat.get(seat) ?? (junkRuleSet.getLegalActions(state, seat) as JunkAction[]);
  // junkRuleSet is typed against RulesetModule<JunkState, JunkAction> (TView defaults
  // to PlayerViewBase); the runtime value is always a full JunkPlayerView, same cast
  // apps/server's room.service.ts already relies on at this exact boundary.
  const view = junkRuleSet.getPlayerView(state, seat) as JunkPlayerView;
  return { seat, action: policies[seat](view, legalActions), prng: seatPick.prng };
};

/** Runs one complete hand in-process, forked from playJunkGame in
 * rulesets/junk/fuzz.ts with the uniform-random policy swapped for per-seat SeatPolicy. */
const playPolicyHand = (
  seed: number,
  dealer: SeatId,
  policies: SeatPolicies,
): JunkState | { error: string } => {
  const started = junkRuleSet.createGame(seed, dealer);
  if ("error" in started) return { error: started.error.code };
  let state = started.state;
  let prng = createPrng(seed ^ 0x9e37_79b9);
  for (let step = 0; step < 500 && state.phase !== "finished"; step += 1) {
    const selected = nextMatchAction(state, policies, prng);
    if (!selected) return { error: "NO_LEGAL_ACTION" };
    prng = selected.prng;
    const result = junkRuleSet.applyAction(state, selected.seat, selected.action);
    if ("error" in result) return { error: result.error.code };
    state = result.state;
  }
  return state.phase === "finished" ? state : { error: "STEP_LIMIT_EXCEEDED" };
};

/**
 * Runs a full multi-hand junk session in-process (no server/socket layer),
 * replicating the score-accumulation / dealer-rotation / ranking loop documented
 * in docs/contracts/session-mechanics.md §4/§5/§8 (today only implemented in
 * apps/server's RoomService): first-hand dealer via computeInitialDealer(seed),
 * computeNextDealer thereafter, scores summed from each hand's result.scoreDeltas,
 * final ranking by score descending with no other tie-breaker (matching
 * RoomService.computeRanking's 4-round behavior).
 *
 * `dealerStreak` (session-mechanics.md §5's cross-hand same-dealer counter) is
 * deliberately not tracked — no ruleset this topic touches (junk) reads it; only
 * hangzhou does, and this arena is junk-only.
 */
export const playJunkMatch = (
  seed: number,
  policies: SeatPolicies,
  rounds = 4,
): JunkMatchResult | JunkMatchFailure => {
  const scores: [number, number, number, number] = [0, 0, 0, 0];
  let dealer = junkRuleSet.computeInitialDealer(seed);
  let prng = createPrng(seed);
  for (let round = 0; round < rounds; round += 1) {
    const seedStep = nextUint32(prng);
    prng = seedStep.prng;
    const finished = playPolicyHand(seedStep.value, dealer, policies);
    if ("error" in finished) return { seed, error: finished.error };
    if (!finished.result) return { seed, error: "MISSING_RESULT" };
    const deltas = finished.result.scoreDeltas;
    for (const seatId of SEAT_IDS) scores[seatId] += deltas[seatId];
    dealer = junkRuleSet.computeNextDealer(finished, dealer);
  }
  const ranking = [...SEAT_IDS].sort((a, b) => scores[b] - scores[a]);
  return { scores, ranking };
};
