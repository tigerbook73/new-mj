import type { SeatId } from "@/lib/ids";
import type { BloodbattlePlayerView, BloodbattleState } from "./types.ts";
import { BLOODBATTLE_TILE_SET } from "./constants.ts";

const publicMelds = (state: BloodbattleState, seat: SeatId) =>
  state.seats[seat]!.melds.map((meld) => ({
    ...meld,
    tiles: meld.tiles.map((tile) => BLOODBATTLE_TILE_SET.kindOf(tile)),
  }));

const publicDiscards = (state: BloodbattleState, seat: SeatId) =>
  state.seats[seat]!.discards.map((discard) => ({
    ...discard,
    tile: BLOODBATTLE_TILE_SET.kindOf(discard.tile),
  }));

export const getPlayerView = (state: BloodbattleState, seat: SeatId): BloodbattlePlayerView => ({
  seat,
  hand: [...state.seats[seat]!.hand],
  seats: state.seats.map((entry, index) => ({
    handCount: entry.hand.length,
    melds: publicMelds(state, index as SeatId),
    discards: publicDiscards(state, index as SeatId),
    status: state.status[index]!,
    ...(state.wins?.[index as SeatId]
      ? {
          winSnapshot: {
            hand: state.wins[index as SeatId]!.hand.map((tile) =>
              BLOODBATTLE_TILE_SET.kindOf(tile),
            ),
            winTile: BLOODBATTLE_TILE_SET.kindOf(state.wins[index as SeatId]!.winTile),
            lack: state.wins[index as SeatId]!.lack,
            melds: publicMelds(state, index as SeatId),
          },
        }
      : {}),
  })),
  wallCount: state.wall.length,
  currentSeat: state.currentSeat,
  phase: state.phase,
  scores: [...state.scores] as BloodbattlePlayerView["scores"],
  ...(state.lack?.[seat] ? { myLackSuit: state.lack[seat] } : {}),
  ...(state.lastDiscard
    ? {
        lastDiscard: {
          seat: state.lastDiscard.seat,
          tile: BLOODBATTLE_TILE_SET.kindOf(state.lastDiscard.tile),
        },
      }
    : {}),
  ...(state.pendingClaims?.options[seat]
    ? { myClaimOptions: [...state.pendingClaims.options[seat]!] }
    : {}),
  ...(state.pendingClaims?.responses[seat]
    ? { myClaimResponse: state.pendingClaims.responses[seat] }
    : {}),
  ...(state.result ? { result: state.result } : {}),
});
