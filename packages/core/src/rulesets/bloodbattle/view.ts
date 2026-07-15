import type { SeatId } from "../../lib/ids.ts";
import type { BloodbattlePlayerView, BloodbattleState } from "./types.ts";

export const getPlayerView = (state: BloodbattleState, seat: SeatId): BloodbattlePlayerView => ({
  seat,
  hand: [...state.seats[seat]!.hand],
  seats: state.seats.map((entry, index) => ({
    handCount: entry.hand.length,
    melds: entry.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    discards: entry.discards.map((discard) => ({ ...discard })),
    status: state.status[index]!,
    ...(state.wins?.[index as SeatId]
      ? {
          winSnapshot: {
            ...state.wins[index as SeatId]!,
            melds: entry.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
          },
        }
      : {}),
  })),
  wallCount: state.wall.length,
  currentSeat: state.currentSeat,
  phase: state.phase,
  scores: [...state.scores] as BloodbattlePlayerView["scores"],
  ...(state.lack?.[seat] ? { myLackSuit: state.lack[seat] } : {}),
  ...(state.lastDiscard ? { lastDiscard: { ...state.lastDiscard } } : {}),
  ...(state.pendingClaims?.options[seat]
    ? { myClaimOptions: [...state.pendingClaims.options[seat]!] }
    : {}),
  ...(state.pendingClaims?.responses[seat]
    ? { myClaimResponse: state.pendingClaims.responses[seat] }
    : {}),
  ...(state.result ? { result: state.result } : {}),
});
