import { eventsVisibleTo, type GameEvent } from "../../events.ts";
import type { SeatId } from "../../lib/ids.ts";
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

type EventPayload = { type: string; [key: string]: unknown };

const cloneView = (view: BloodbattlePlayerView): BloodbattlePlayerView => ({
  ...view,
  hand: [...view.hand],
  scores: [...view.scores] as BloodbattlePlayerView["scores"],
  seats: view.seats.map((entry) => ({
    ...entry,
    melds: entry.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    discards: entry.discards.map((discard) => ({ ...discard })),
    ...(entry.winSnapshot
      ? {
          winSnapshot: {
            ...entry.winSnapshot,
            hand: [...entry.winSnapshot.hand],
            melds: entry.winSnapshot.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
          },
        }
      : {}),
  })),
  ...(view.lastDiscard ? { lastDiscard: { ...view.lastDiscard } } : {}),
  ...(view.myClaimOptions ? { myClaimOptions: [...view.myClaimOptions] } : {}),
  ...(view.result ? { result: { ...view.result, winners: [...view.result.winners] } } : {}),
});

const payloadOf = (payload: unknown): EventPayload => payload as EventPayload;

const removeKind = (hand: number[], tileKind: string, count: number): void => {
  let remaining = count;
  for (let index = hand.length - 1; index >= 0 && remaining > 0; index -= 1) {
    if (BLOODBATTLE_TILE_SET.kindOf(hand[index] as never) === tileKind) {
      hand.splice(index, 1);
      remaining -= 1;
    }
  }
};

const markClaimed = (view: BloodbattlePlayerView, from: SeatId, kind: string, by: SeatId): void => {
  const discard = [...view.seats[from]!.discards]
    .reverse()
    .find((entry) => entry.tile === kind && entry.claimedBy === undefined);
  if (discard) discard.claimedBy = by;
};

/** Rebuild a seat's public view from only the events visible to that seat. */
export const rebuildPlayerView = (
  events: readonly GameEvent[],
  seat: SeatId,
): BloodbattlePlayerView => {
  let view: BloodbattlePlayerView | undefined;
  let exchangeTiles: number[] | undefined;
  for (const event of eventsVisibleTo(events, seat)) {
    const payload = payloadOf(event.payload);
    if (payload.type === "GameStarted") {
      const config = payload.config as { exchangeThree?: boolean };
      const handCounts = payload.handCounts as number[];
      view = {
        seat,
        hand: [],
        seats: handCounts.map((handCount) => ({
          handCount,
          melds: [],
          discards: [],
          status: "active",
        })),
        wallCount: payload.wallCount as number,
        currentSeat: payload.dealer as SeatId,
        phase: config.exchangeThree ? "exchanging" : "choosing-lack",
        scores: [0, 0, 0, 0],
      };
      continue;
    }
    if (!view) throw new Error("MISSING_GAME_STARTED");
    view = cloneView(view);
    switch (payload.type) {
      case "HandDealt":
        if (payload.seat === seat) view.hand = [...(payload.tiles as number[])];
        break;
      case "ExchangeThreeSelected":
        if (event.visibility.type === "seat" && event.visibility.seats.includes(seat))
          exchangeTiles = [...(payload.tiles as number[])];
        break;
      case "TilesReceived":
        if (event.visibility.type === "seat" && event.visibility.seats.includes(seat))
          view.hand.push(...(payload.tiles as number[]));
        break;
      case "ExchangeCompleted":
        if (exchangeTiles) {
          for (const tile of exchangeTiles) {
            const index = view.hand.indexOf(tile);
            if (index >= 0) view.hand.splice(index, 1);
          }
          exchangeTiles = undefined;
        }
        view.phase = "choosing-lack";
        break;
      case "LackChosen":
        if (
          event.visibility.type === "seat" &&
          event.visibility.seats.includes(seat) &&
          payload.suit
        )
          view.myLackSuit = payload.suit as "m" | "p" | "s";
        break;
      case "TurnStarted":
        view.currentSeat = payload.seat as SeatId;
        view.phase = "playing";
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        break;
      case "TileDrawn":
      case "GangReplacementDrawn": {
        const drawnSeat = payload.seat as SeatId;
        view.wallCount -= 1;
        view.seats[drawnSeat]!.handCount += 1;
        break;
      }
      case "TileDrawnPrivate":
        if (payload.seat === seat) view.hand.push(payload.tile as number);
        break;
      case "TileDiscarded": {
        const discardedSeat = payload.seat as SeatId;
        const tile = payload.tile as number;
        const tileKind = BLOODBATTLE_TILE_SET.kindOf(tile);
        view.seats[discardedSeat]!.handCount -= 1;
        view.seats[discardedSeat]!.discards.push({ tile: tileKind as never });
        view.lastDiscard = { seat: discardedSeat, tile: tileKind as never };
        view.phase = "awaiting-claims";
        break;
      }
      case "TileDiscardedPrivate":
        if (payload.seat === seat) {
          const index = view.hand.indexOf(payload.tile as number);
          if (index >= 0) view.hand.splice(index, 1);
        }
        break;
      case "ClaimWindowOpened":
        view.phase = "awaiting-claims";
        {
          const tile = payload.tile as number;
          const tileKind = BLOODBATTLE_TILE_SET.kindOf(tile);
          view.lastDiscard = {
            seat: payload.seat as SeatId,
            tile: tileKind as never,
          };
        }
        if (payload.options && (payload.options as Record<string, unknown>)[seat])
          view.myClaimOptions = [
            ...(((payload.options as Record<string, unknown>)[
              seat
            ] as BloodbattlePlayerView["myClaimOptions"]) ?? []),
          ];
        break;
      case "ClaimResponded":
        if (payload.seat === seat && payload.action)
          view.myClaimResponse = payload.action as NonNullable<
            BloodbattlePlayerView["myClaimResponse"]
          >;
        break;
      case "PengMade": {
        const meldSeat = payload.seat as SeatId;
        const tiles = (payload.tiles as number[]) ?? [];
        const tileKind = tiles.length > 0 ? BLOODBATTLE_TILE_SET.kindOf(tiles[0]!) : "";
        view.seats[meldSeat]!.handCount -= 2;
        view.seats[meldSeat]!.melds.push({
          type: "peng",
          tiles: [tileKind, tileKind, tileKind] as never,
          from: payload.from as SeatId,
        });
        if (meldSeat === seat) removeKind(view.hand, tileKind, 2);
        markClaimed(view, payload.from as SeatId, tileKind, meldSeat);
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        break;
      }
      case "GangMade": {
        const meldSeat = payload.seat as SeatId;
        const gangType = payload.gangType as "anGang" | "buGang" | "minGang";
        const tiles = (payload.tiles as number[]) ?? [];
        const tileKind = tiles.length > 0 ? BLOODBATTLE_TILE_SET.kindOf(tiles[0]!) : "";
        const kinds = tiles.map((t) => BLOODBATTLE_TILE_SET.kindOf(t));
        const existing = view.seats[meldSeat]!.melds.find(
          (meld) => meld.type === "peng" && meld.tiles[0] === tileKind,
        );
        if (gangType === "buGang" && existing) {
          existing.type = "buGang";
          existing.tiles = kinds as never;
        } else {
          view.seats[meldSeat]!.melds.push({
            type: gangType,
            tiles: kinds as never,
            ...(payload.from === undefined ? {} : { from: payload.from as SeatId }),
          });
        }
        const used = gangType === "anGang" ? 4 : gangType === "minGang" ? 3 : 1;
        view.seats[meldSeat]!.handCount -= used;
        if (meldSeat === seat) removeKind(view.hand, tileKind, used);
        if (payload.from !== undefined)
          markClaimed(view, payload.from as SeatId, tileKind, meldSeat);
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        break;
      }
      case "HuDeclared": {
        const winner = payload.seat as SeatId;
        const snapshot = payload.snapshot as {
          hand: number[];
          winTile: number;
          lack: BloodbattlePlayerView["myLackSuit"];
          melds: Array<{ type: string; tiles: number[]; from?: SeatId }>;
        };
        view.seats[winner]!.status = "won";
        view.seats[winner]!.handCount = 0;
        view.seats[winner]!.winSnapshot = {
          hand: snapshot.hand.map((t) => BLOODBATTLE_TILE_SET.kindOf(t)) as never,
          winTile: BLOODBATTLE_TILE_SET.kindOf(snapshot.winTile) as never,
          lack: snapshot.lack!,
          melds: snapshot.melds.map((meld) => ({
            type: meld.type as never,
            tiles: meld.tiles.map((t) => BLOODBATTLE_TILE_SET.kindOf(t)) as never,
            ...(meld.from === undefined ? {} : { from: meld.from as never }),
          })) as BloodbattlePlayerView["seats"][number]["melds"],
        };
        view.scores[winner] += (payload.scoring as { multiplier: number }).multiplier;
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        break;
      }
      case "Settled": {
        const deltas = payload.scoreDeltas as number[];
        view.scores = view.scores.map(
          (score, index) => score + deltas[index]!,
        ) as BloodbattlePlayerView["scores"];
        break;
      }
      case "WallExhausted":
        view.phase = "finished";
        break;
      case "GameEnded":
        if (payload.result)
          view.result = payload.result as NonNullable<BloodbattlePlayerView["result"]>;
        view.phase = "finished";
        break;
      default:
        break;
    }
  }
  if (!view) throw new Error("MISSING_GAME_STARTED");
  return view;
};
