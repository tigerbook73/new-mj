import { eventsVisibleTo, type GameEvent } from "../../events.ts";
import type { SeatId } from "../../lib/ids.ts";
import type { BloodbattleEventPayload, BloodbattlePlayerView, BloodbattleState } from "./types.ts";
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
  events: readonly GameEvent<BloodbattleEventPayload>[],
  seat: SeatId,
): BloodbattlePlayerView => {
  let view: BloodbattlePlayerView | undefined;
  let exchangeTiles: number[] | undefined;
  for (const event of eventsVisibleTo(events, seat)) {
    const payload = event.payload;
    if (payload.type === "GameStarted") {
      view = {
        seat,
        hand: [],
        seats: payload.handCounts.map((handCount) => ({
          handCount,
          melds: [],
          discards: [],
          status: "active",
        })),
        wallCount: payload.wallCount,
        currentSeat: payload.dealer,
        phase: payload.config.exchangeThree ? "exchanging" : "choosing-lack",
        scores: [0, 0, 0, 0],
      };
      continue;
    }
    if (!view) throw new Error("MISSING_GAME_STARTED");
    view = cloneView(view);
    switch (payload.type) {
      case "HandDealt":
        if (payload.seat === seat) view.hand = [...payload.tiles];
        break;
      case "ExchangeThreeSelected":
        if (event.visibility.type === "seat" && event.visibility.seats.includes(seat))
          exchangeTiles = [...payload.tiles];
        break;
      case "TilesReceived":
        if (event.visibility.type === "seat" && event.visibility.seats.includes(seat))
          view.hand.push(...payload.tiles);
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
        if (event.visibility.type === "seat" && event.visibility.seats.includes(seat))
          view.myLackSuit = payload.suit;
        break;
      case "TurnStarted":
        view.currentSeat = payload.seat;
        view.phase = "playing";
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        break;
      case "TileDrawn":
      case "GangReplacementDrawn": {
        const drawnSeat = payload.seat;
        view.wallCount -= 1;
        view.seats[drawnSeat]!.handCount += 1;
        break;
      }
      case "TileDrawnPrivate":
        if (payload.seat === seat) view.hand.push(payload.tile);
        break;
      case "TileDiscarded": {
        const discardedSeat = payload.seat;
        const tile = payload.tile;
        const tileKind = BLOODBATTLE_TILE_SET.kindOf(tile);
        view.seats[discardedSeat]!.handCount -= 1;
        view.seats[discardedSeat]!.discards.push({ tile: tileKind });
        view.lastDiscard = { seat: discardedSeat, tile: tileKind };
        view.phase = "awaiting-claims";
        break;
      }
      case "TileDiscardedPrivate":
        if (payload.seat === seat) {
          const index = view.hand.indexOf(payload.tile);
          if (index >= 0) view.hand.splice(index, 1);
        }
        break;
      case "ClaimWindowOpened": {
        view.phase = "awaiting-claims";
        const tileKind = BLOODBATTLE_TILE_SET.kindOf(payload.tile);
        view.lastDiscard = { seat: payload.seat, tile: tileKind };
        const own = payload.options[seat];
        if (own) view.myClaimOptions = [...own];
        break;
      }
      case "ClaimResponded":
        if (payload.seat === seat) view.myClaimResponse = payload.action;
        break;
      case "ClaimWindowResolved":
        // Only ever emitted for the "nobody claimed" result (see drawNext) — a
        // claimed peng/minGang/hu has its own PengMade/GangMade/HuDeclared event to
        // carry this signal instead, so there's no other branch to handle here.
        view.phase = "awaiting-draw";
        view.currentSeat = payload.seat;
        break;
      case "PengMade": {
        const meldSeat = payload.seat;
        // tiles is always the 3-element [pair, pair, claimed] triple — see resolveClaims.
        const tileKind = BLOODBATTLE_TILE_SET.kindOf(payload.tiles[0]!);
        view.seats[meldSeat]!.handCount -= 2;
        view.seats[meldSeat]!.melds.push({
          type: "peng",
          tiles: [tileKind, tileKind, tileKind],
          from: payload.from,
        });
        if (meldSeat === seat) removeKind(view.hand, tileKind, 2);
        markClaimed(view, payload.from, tileKind, meldSeat);
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        break;
      }
      case "GangMade": {
        const meldSeat = payload.seat;
        const gangType = payload.gangType;
        // anGang/buGang carry kind-level `kinds` directly; only a claimed minGang
        // carries raw `tiles`, converted to kinds here (see BloodbattleGangMadePayload).
        const kinds =
          "kinds" in payload ? payload.kinds : payload.tiles.map(BLOODBATTLE_TILE_SET.kindOf);
        const tileKind = kinds.length > 0 ? kinds[0]! : "";
        const existing = view.seats[meldSeat]!.melds.find(
          (meld) => meld.type === "peng" && meld.tiles[0] === tileKind,
        );
        if (gangType === "buGang" && existing) {
          existing.type = "buGang";
          existing.tiles = kinds;
        } else {
          view.seats[meldSeat]!.melds.push({
            type: gangType,
            tiles: kinds,
            ...("from" in payload ? { from: payload.from } : {}),
          });
        }
        const used = gangType === "anGang" ? 4 : gangType === "minGang" ? 3 : 1;
        view.seats[meldSeat]!.handCount -= used;
        if (meldSeat === seat) removeKind(view.hand, tileKind, used);
        if ("from" in payload) markClaimed(view, payload.from, tileKind, meldSeat);
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        // Every gang — self-gang or claimed minGang — is followed by a draw (never
        // an immediate turn, unlike peng), so it always lands in "awaiting-draw" here.
        view.phase = "awaiting-draw";
        view.currentSeat = meldSeat;
        break;
      }
      case "HuDeclared": {
        const winner = payload.seat;
        const snapshot = payload.snapshot;
        view.seats[winner]!.status = "won";
        view.seats[winner]!.handCount = 0;
        view.seats[winner]!.winSnapshot = {
          hand: snapshot.hand.map((t) => BLOODBATTLE_TILE_SET.kindOf(t)),
          winTile: BLOODBATTLE_TILE_SET.kindOf(snapshot.winTile),
          lack: snapshot.lack,
          melds: snapshot.melds.map((meld) => ({
            type: meld.type,
            tiles: meld.tiles.map((t) => BLOODBATTLE_TILE_SET.kindOf(t)),
            ...(meld.from === undefined ? {} : { from: meld.from }),
          })),
        };
        view.scores[winner] += payload.scoring.multiplier;
        delete view.myClaimOptions;
        delete view.myClaimResponse;
        break;
      }
      case "Settled": {
        const deltas = payload.scoreDeltas;
        view.scores = view.scores.map(
          (score, index) => score + deltas[index]!,
        ) as BloodbattlePlayerView["scores"];
        break;
      }
      case "WallExhausted":
        view.phase = "finished";
        break;
      case "GameEnded":
        view.result = payload.result;
        view.phase = "finished";
        break;
      default:
        break;
    }
  }
  if (!view) throw new Error("MISSING_GAME_STARTED");
  return view;
};
