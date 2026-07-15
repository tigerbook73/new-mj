import type { GameEvent } from "@/events.ts";
import { STANDARD_TILE_SET } from "@/lib/tiles.ts";
import type { SeatId } from "@/lib/ids.ts";
import type { Meld } from "@/lib/seat.ts";
import type { JunkAction, JunkApplyResult, JunkClaimAction, JunkState } from "./types.ts";
import {
  appendEvent,
  beginTurn,
  configOf,
  fail,
  finishRonWins,
  publicVisibility,
  removeTiles,
  resolveUnclaimed,
  sameKind,
  seatVisibility,
} from "./state-machine.ts";

export const priority = (action: JunkClaimAction): number =>
  ({ hu: 4, minGang: 3, peng: 2, chi: 1 })[action.type];
export const distanceFromDiscarder = (discarder: SeatId, seat: SeatId): number =>
  (seat - discarder + 4) % 4;

export const chooseClaims = (
  state: JunkState,
): Array<{ seat: SeatId; action: JunkClaimAction }> => {
  const pending = state.pendingClaims!;
  const choices = Object.entries(pending.responses)
    .filter((entry): entry is [string, JunkClaimAction] => entry[1].type !== "pass")
    .map(([seat, action]) => ({ seat: Number(seat) as SeatId, action: action as JunkClaimAction }));
  const sorted = choices.sort((left, right) => {
    const priorityDiff = priority(right.action) - priority(left.action);
    return priorityDiff !== 0
      ? priorityDiff
      : distanceFromDiscarder(pending.discard.seat, left.seat) -
          distanceFromDiscarder(pending.discard.seat, right.seat);
  });
  if (sorted[0]?.action.type === "hu" && configOf(state).multiHuPolicy === "all") {
    return sorted.filter((choice) => choice.action.type === "hu");
  }
  return sorted.slice(0, 1);
};

export const resolveClaimWindow = (state: JunkState, events: GameEvent[]): void => {
  const pending = state.pendingClaims!;
  const winners = chooseClaims(state);
  if (winners.length === 0) return resolveUnclaimed(state, events);
  const { seat, action } = winners[0]!;
  const discard = pending.discard;
  delete state.pendingClaims;
  appendEvent(state, events, publicVisibility, {
    type: "ClaimWindowResolved",
    seat,
    action: action.type,
  });
  if (action.type === "hu") {
    // A ron tile stays physically in the active river. It is revealed in the
    // terminal event, rather than moved into a meld (only chi/peng/gang claim it).
    finishRonWins(
      state,
      events,
      winners.map((winner) => winner.seat),
      discard.seat,
      discard.tile,
    );
    return;
  }
  state.seats[discard.seat]!.discards.find(
    (entry) => entry.tile === discard.tile && entry.claimedBy === undefined,
  )!.claimedBy = seat;
  const hand = state.seats[seat]!.hand;
  const useTiles =
    action.type === "chi"
      ? action.tiles
      : sameKind(hand, STANDARD_TILE_SET.kindOf(discard.tile)).slice(
          0,
          action.type === "minGang" ? 3 : 2,
        );
  const remaining = removeTiles(hand, useTiles)!;
  state.seats[seat]!.hand = remaining;
  const meld: Meld = { type: action.type, tiles: [...useTiles, discard.tile], from: discard.seat };
  state.seats[seat]!.melds.push(meld);
  const eventType =
    action.type === "chi" ? "ChiMade" : action.type === "peng" ? "PengMade" : "GangMade";
  appendEvent(state, events, publicVisibility, {
    type: eventType,
    seat,
    tiles: meld.tiles,
    from: discard.seat,
  });
  beginTurn(state, events, seat, action.type === "minGang", action.type === "minGang");
};

export const allResponded = (state: JunkState): boolean => {
  const pending = state.pendingClaims!;
  return Object.keys(pending.options).every(
    (seat) => pending.responses[Number(seat) as SeatId] !== undefined,
  );
};

export const actionEquals = (left: JunkAction, right: JunkAction): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const applyClaimResponse = (
  state: JunkState,
  seat: SeatId,
  action: JunkAction,
  events: GameEvent[],
): JunkApplyResult => {
  if (state.phase !== "awaiting-claims" || !state.pendingClaims)
    return fail("CLAIM_WINDOW_NOT_OPEN");
  const options = state.pendingClaims.options[seat];
  if (!options || state.pendingClaims.responses[seat]) return fail("CLAIM_NOT_AVAILABLE");
  if (action.type !== "pass" && !options.some((option) => actionEquals(option.action, action)))
    return fail("CLAIM_NOT_AVAILABLE");
  state.pendingClaims.responses[seat] = action;
  appendEvent(state, events, seatVisibility(seat), { type: "ClaimResponded", action });
  if (allResponded(state)) resolveClaimWindow(state, events);
  return { state, events };
};
