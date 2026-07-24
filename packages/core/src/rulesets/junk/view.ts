import { eventsVisibleTo, type GameEvent } from "../../events.ts";
import type { SeatId } from "../../lib/ids.ts";
import type { JunkAction, JunkGameResult, JunkPlayerView, JunkState } from "./types.ts";

export const getPlayerView = (state: JunkState, seat: SeatId): JunkPlayerView => {
  const pending = state.pendingClaims;
  const ownResponse = pending?.responses[seat];
  const view: JunkPlayerView = {
    seat,
    hand: [...state.seats[seat]!.hand],
    seats: state.seats.map((entry, index) => ({
      melds: entry.melds.map((meld) => ({
        ...meld,
        tiles: meld.type === "anGang" && index !== seat ? [] : [...meld.tiles],
      })),
      discards: entry.discards.map((discard) => ({ ...discard })),
      handCount: entry.hand.length,
      justDrawn: state.justDrawn?.seat === index,
    })),
    wallCount: state.wall.length,
    currentSeat: state.currentSeat,
    phase: state.phase,
  };
  if (state.lastDiscard) view.lastDiscard = { ...state.lastDiscard };
  if (state.justDrawn?.seat === seat) view.justDrawn = state.justDrawn.tile;
  if (state.result) view.result = state.result;
  if (pending?.options[seat]) view.myClaimOptions = [...pending.options[seat]];
  if (ownResponse) view.myClaimResponse = ownResponse;
  return view;
};

type EventPayload = { type: string; [key: string]: unknown };

const cloneView = (view: JunkPlayerView): JunkPlayerView => ({
  ...view,
  hand: [...view.hand],
  seats: view.seats.map((seat) => ({
    handCount: seat.handCount,
    melds: seat.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    discards: seat.discards.map((discard) => ({ ...discard })),
    justDrawn: seat.justDrawn,
  })),
  ...(view.lastDiscard ? { lastDiscard: { ...view.lastDiscard } } : {}),
  ...(view.result ? { result: view.result } : {}),
});

const expectPayload = (payload: unknown): EventPayload => payload as EventPayload;

const updateMeld = (
  view: JunkPlayerView,
  seat: SeatId,
  type: "chi" | "peng" | "minGang" | "anGang" | "buGang",
  tiles: number[],
  from?: SeatId,
): void => {
  const meld = from === undefined ? { type, tiles } : { type, tiles, from };
  view.seats[seat]!.melds.push(meld);
};

/**
 * Rebuild the state a seat can observe from its filtered event stream.
 * It intentionally has no JunkState input, so tests catch accidental leakage.
 */
export const rebuildPlayerView = (events: readonly GameEvent[], seat: SeatId): JunkPlayerView => {
  let view: JunkPlayerView | undefined;
  // The dealer's initial 14th tile is dealt, not drawn via TileDrawn, but it's
  // the same "just drew, haven't acted yet" state — see docs/variants/junk.md §7.
  let dealer: SeatId | undefined;
  for (const event of eventsVisibleTo(events, seat)) {
    const payload = expectPayload(event.payload);
    if (payload.type === "GameStarted") {
      const handCounts = payload.handCounts as number[];
      dealer = payload.dealer as SeatId;
      view = {
        seat,
        hand: [],
        seats: handCounts.map((handCount, index) => ({
          handCount,
          melds: [],
          discards: [],
          justDrawn: index === dealer,
        })),
        wallCount: payload.wallCount as number,
        currentSeat: dealer,
        phase: "dealing",
      };
      continue;
    }
    if (!view) throw new Error("MISSING_GAME_STARTED");
    view = cloneView(view);
    switch (payload.type) {
      case "HandDealt": {
        if ((payload.seat as SeatId) === seat) {
          view.hand = [...(payload.tiles as number[])];
          // Dealer's HandDealt always carries 14 tiles, so the last index exists.
          if (seat === dealer) view.justDrawn = view.hand[view.hand.length - 1]!;
        }
        break;
      }
      case "TurnStarted":
        view.currentSeat = payload.seat as SeatId;
        view.phase = "playing";
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        break;
      case "TileDrawn":
      case "GangReplacementDrawn": {
        const drawnSeat = payload.seat as SeatId;
        view.seats[drawnSeat]!.justDrawn = true;
        if ("tile" in payload) {
          if (drawnSeat === seat) {
            view.hand.push(payload.tile as number);
            view.justDrawn = payload.tile as number;
          }
        } else {
          view.seats[drawnSeat]!.handCount += 1;
          view.wallCount -= 1;
        }
        break;
      }
      case "TileDiscarded": {
        const discardedSeat = payload.seat as SeatId;
        const tile = payload.tile as number;
        view.seats[discardedSeat]!.handCount -= 1;
        view.seats[discardedSeat]!.discards.push({ tile });
        view.seats[discardedSeat]!.justDrawn = false;
        if (discardedSeat === seat) {
          view.hand = view.hand.filter((candidate) => candidate !== tile);
          delete view.justDrawn;
        }
        view.lastDiscard = { seat: discardedSeat, tile };
        view.phase = "awaiting-claims";
        break;
      }
      case "ClaimWindowOpened":
        view.myClaimOptions = [...((payload.options as JunkPlayerView["myClaimOptions"]) ?? [])];
        break;
      case "LegalActionsUpdated":
        view.myActionOptions = [...(payload.actions as JunkAction[])];
        break;
      case "ClaimResponded":
        view.myClaimResponse = payload.action as JunkAction;
        break;
      case "ClaimWindowResolved":
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        break;
      case "ChiMade":
      case "PengMade":
      case "GangMade": {
        const meldSeat = payload.seat as SeatId;
        view.seats[meldSeat]!.justDrawn = false;
        if (meldSeat === seat) delete view.justDrawn;
        const gangType = payload.gangType as "anGang" | "buGang" | undefined;
        const type =
          payload.type === "ChiMade"
            ? "chi"
            : payload.type === "PengMade"
              ? "peng"
              : (gangType ?? "minGang");
        const tiles = "tiles" in payload ? [...(payload.tiles as number[])] : [];
        const from = payload.from as SeatId | undefined;
        const privateAnGangReveal =
          type === "anGang" &&
          tiles.length > 0 &&
          view.seats[meldSeat]!.melds.some(
            (meld) => meld.type === "anGang" && meld.tiles.length === 0,
          );
        if (type === "buGang") {
          const existing = view.seats[meldSeat]!.melds.find(
            (meld) => meld.type === "peng" && meld.tiles.some((tile) => tiles.includes(tile)),
          );
          if (existing) {
            existing.type = "buGang";
            existing.tiles = tiles;
          }
        } else if (privateAnGangReveal) {
          view.seats[meldSeat]!.melds.find(
            (meld) => meld.type === "anGang" && meld.tiles.length === 0,
          )!.tiles = tiles;
        } else {
          updateMeld(view, meldSeat, type, tiles, from);
        }
        const usedFromHand =
          type === "chi"
            ? 2
            : type === "peng"
              ? 2
              : type === "minGang"
                ? 3
                : type === "anGang"
                  ? 4
                  : 1;
        if (!privateAnGangReveal) view.seats[meldSeat]!.handCount -= usedFromHand;
        if (!privateAnGangReveal && meldSeat === seat && tiles.length > 0) {
          const ownTiles =
            type === "chi" || type === "peng" || type === "minGang"
              ? tiles.slice(0, -1)
              : type === "buGang"
                ? [tiles[tiles.length - 1]!]
                : tiles;
          view.hand = view.hand.filter((tile) => !ownTiles.includes(tile));
        }
        const discardedTile =
          type === "chi" || type === "peng" || type === "minGang"
            ? tiles[tiles.length - 1]
            : undefined;
        if (from !== undefined && discardedTile !== undefined) {
          const discard = view.seats[from]!.discards.find(
            (entry) => entry.tile === discardedTile && entry.claimedBy === undefined,
          );
          if (discard) discard.claimedBy = meldSeat;
        }
        break;
      }
      case "HuDeclared":
        view.phase = "finished";
        break;
      case "WallExhausted":
        view.phase = "finished";
        break;
      case "GameEnded":
        view.result = payload.result as JunkGameResult;
        view.phase = "finished";
        break;
      default:
        break;
    }
  }
  if (!view) throw new Error("MISSING_GAME_STARTED");
  return view;
};
