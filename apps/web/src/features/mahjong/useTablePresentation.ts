import type { PlayerViewBase, SeatId } from "@new-mj/protocol";
import type { DiscardEntry } from "@/features/mahjong/components/DiscardPile";
import type { Meld } from "@/features/mahjong/components/MeldGroup";
import type { SeatContent } from "@/features/mahjong/components/TableBoard";
import {
  isCaishenTile,
  sortTilesForDisplay,
  type TileKind,
} from "@/features/mahjong/lib/mahjongTiles";
import {
  directionOf,
  seatAt,
  SEAT_DIRECTIONS,
  type SeatDirection,
} from "@/features/mahjong/lib/seatLayout";

type JunkSeatExtra = {
  handCount: number;
  melds: Meld[];
  discards: DiscardEntry[];
  /** Public: this seat just drew and hasn't acted yet — see docs/variants/junk.md §7. */
  justDrawn: boolean;
  /** Public, present only for a seat that just won this round (hangzhou/junk).
   * `groups` is already TileKind-level
   * (the concealed decomposition actually used), so it needs no id→kind conversion. */
  winSnapshot?: { hand: TileKind[]; winTile: TileKind; groups: TileKind[][] };
};

export type GameResultLike =
  | { type: "draw"; scoreDeltas: [number, number, number, number] }
  | {
      type: "win";
      winner: number;
      winners: Array<
        number | { seat: number; fanTypes: string[]; multiplier: number; payout: number }
      >;
      winType: "zimo" | "ron";
      from?: number;
      scoreDeltas: [number, number, number, number];
    };

export type TableViewExtras = {
  phase?: string;
  myActionOptions?: Record<string, unknown>[];
  seats?: JunkSeatExtra[];
  /** Private: only present when it's my own seat's just-drawn tile. */
  justDrawn?: number;
  /** Public: the single most recent discard on the table — see docs/variants/junk.md §7. */
  lastDiscard?: { seat: SeatId; tile: number };
  /** Public: present once `phase==="finished"` — drives RoundEndOverlay below. */
  result?: GameResultLike;
  /**
   * Hangzhou-only derived state (docs/variants/hangzhou.md §4/§11), read the
   * same loose way as everything else in this type — absent for junk/
   * bloodbattle views, so callers gate on presence, not on rulesetId.
   */
  isTingpai?: boolean;
  isBaotou?: boolean;
  isCaipiao?: boolean;
  /** Hangzhou-only, public (hangzhou.md §5/§11): whether ron is currently
   * allowed table-wide. Absent for junk/bloodbattle. */
  dealerStreak?: number;
};

type PlayerInfo = { nickname?: string } | null;

const EMPTY_SEAT: JunkSeatExtra = { handCount: 0, melds: [], discards: [], justDrawn: false };

/**
 * Converts the ruleset-private PlayerView fields into the presentation props used by TableBoard.
 * For game state it deliberately reads only the server-provided view; it neither derives legal
 * actions nor mutates state from command acknowledgements. It does also thread through
 * `pendingDiscardOrigin`'s click-time geometry (see TableView.tsx) onto the matching discard
 * entry, since presentation is exactly where server view and local UI-only signal are meant to
 * merge; it never influences what's derived from `view` itself. Whether any slot actually plays
 * an entry animation is decided by animationLedger, not here — see the *LedgerKey fields below.
 */
export function useTablePresentation({
  view,
  players,
  onDiscard,
  pendingDiscardOrigin,
  gameNumber = 1,
  rulesetId,
  dealer,
}: {
  view: PlayerViewBase | null;
  players: readonly PlayerInfo[] | undefined;
  onDiscard: (tile: number, originRect?: DOMRect) => void;
  /** See TableView.tsx — a click-time rect capture for the discard-flying-out ghost, matched against the newly-landed discard entry by TileId. */
  pendingDiscardOrigin?: { tile: number; rect: DOMRect } | null;
  /** RoomInfo.gameNumber — prefixes drawnSlotLedgerKey so it lines up with animationLedger's game-scoped keys. */
  gameNumber?: number;
  /** RoomInfo.rulesetId — only used to gate the caishen tile highlight (see
   * mahjongTiles.ts's isCaishenTile); nothing else here branches on it. */
  rulesetId?: string | undefined;
  /** RoomInfo.dealer — which seat gets InfoSlot's crown badge. */
  dealer?: SeatId | undefined;
}) {
  if (!view) {
    return undefined;
  }
  const highlightCaishen = rulesetId === "hangzhou";
  const extras = view as unknown as TableViewExtras;
  const isMyTurn = view.currentSeat === view.seat && extras.phase === "playing";
  const actionOptions = extras.myActionOptions ?? [];
  // "draw" is core-gated but server-auto-submitted (docs/contracts/session-mechanics.md
  // "摸牌延时代提交") — it must never render as a clickable dock affordance.
  const hasDockActions = actionOptions.some(
    (action) => action.type !== "discard" && action.type !== "draw",
  );
  const seatData = (seat: SeatId): JunkSeatExtra => extras.seats?.[seat] ?? EMPTY_SEAT;

  const seats = Object.fromEntries(
    SEAT_DIRECTIONS.map((direction) => {
      const seat = seatAt(view.seat, direction);
      const data = seatData(seat);
      const player = players?.[seat];
      const drawnVisible = direction === "bottom" ? extras.justDrawn !== undefined : data.justDrawn;
      // Render order: hangzhou's caishen (financial) first, set off by an empty
      // gap slot from the rest of the concealed hand (docs/variants/hangzhou.md
      // §2 — it's never chi/peng/gang-able, so keeping it visually apart from
      // the "normal" tiles you might discard alongside is worth the special
      // case; junk/bloodbattle skip this branch entirely, same sort as before),
      // then always exactly two trailing slots — another empty gap, then the
      // just-drawn tile (or an empty slot when nobody has just drawn) — so the
      // pinned position never shifts the row's total width. Opponents have no
      // real TileIds to show, so their "rest" slots are meaningless filler (0)
      // that HandRow never reads as an id because `revealed` is false.
      const restOfHand =
        extras.justDrawn !== undefined
          ? view.hand.filter((tile) => tile !== extras.justDrawn)
          : view.hand;
      const caishenTiles = highlightCaishen ? restOfHand.filter(isCaishenTile) : [];
      const nonCaishenTiles = highlightCaishen
        ? restOfHand.filter((tile) => !isCaishenTile(tile))
        : restOfHand;
      const handTiles: number[] =
        direction === "bottom"
          ? [
              ...sortTilesForDisplay(caishenTiles),
              ...(caishenTiles.length > 0 ? [-1] : []),
              ...sortTilesForDisplay(nonCaishenTiles),
              -1,
              extras.justDrawn ?? -1,
            ]
          : [
              ...Array<number>(drawnVisible ? data.handCount - 1 : data.handCount).fill(0),
              -1,
              drawnVisible ? 0 : -1,
            ];
      // A real TileId is globally unique (see docs/architecture/frontend-
      // layout.md §5), so keying my own drawn slot by it already changes on
      // every new draw. Opponents never expose a real TileId here (public
      // events can't reveal concealed hands); their handCount toggles between two values
      // across a draw/discard cycle, which is enough to tell "this draw" from
      // "last draw" apart across the one render transition that matters, even
      // though the same numeric value recurs turn after turn.
      const drawnSlotKey =
        direction === "bottom"
          ? extras.justDrawn !== undefined
            ? `own-${extras.justDrawn}`
            : "none"
          : drawnVisible
            ? `opp-${seat}-${data.handCount}`
            : "none";
      // animationLedger's key for this seat's draw lane — unlike drawnSlotKey
      // (a React key that must change on every new draw so the slot remounts),
      // this stays fixed per seat: only one draw can be "in flight" per seat
      // at a time (the lane), so reusing the same ledger key across successive
      // draws is exactly what lets a structural conflict resolve to skip — see
      // animationLedger.ts.
      const drawnSlotLedgerKey = `g${gameNumber}:draw:${direction === "bottom" ? "own" : "opp"}:${seat}`;
      const content: SeatContent = {
        melds: data.melds.map((meld, meldIndex) => ({
          ...meld,
          ...(meld.from !== undefined
            ? { fromDirection: directionOf(view.seat, meld.from as SeatId) }
            : {}),
          // Must match diffPlayerView's meld:<seat>:<index>:<tileCount> key
          // exactly — the trailing tile count disambiguates buGang's
          // in-place growth of an existing meldIndex from a brand-new one.
          meldLedgerKey: `g${gameNumber}:meld:${seat}:${meldIndex}:${meld.tiles.length}`,
        })),
        handTiles,
        revealed: direction === "bottom",
        info: player?.nickname ?? `Seat ${seat + 1}`,
        isDealer: seat === dealer,
        drawnSlotKey,
        drawnSlotLedgerKey,
        highlightCaishen,
        ...(direction === "bottom" ? { interactive: isMyTurn, onDiscard } : {}),
      };
      return [direction, content];
    }),
  ) as Record<SeatDirection, SeatContent>;

  const discards = Object.fromEntries(
    SEAT_DIRECTIONS.map((direction) => {
      const seat = seatAt(view.seat, direction);
      const entries = seatData(seat).discards.map((entry, index) => {
        const justDiscarded =
          extras.lastDiscard?.seat === seat && extras.lastDiscard.tile === entry.tile;
        return {
          ...entry,
          claimedByDirection:
            entry.claimedBy !== undefined
              ? directionOf(view.seat, entry.claimedBy as SeatId)
              : undefined,
          justDiscarded,
          // animationLedger key for this exact discard entry — see
          // diffPlayerView.ts's discard:<seat>:<index> key scheme.
          discardLedgerKey: `g${gameNumber}:discard:${seat}:${index}`,
          flightOrigin:
            pendingDiscardOrigin?.tile === entry.tile ? pendingDiscardOrigin.rect : undefined,
          highlightCaishen,
        };
      });
      return [direction, entries];
    }),
  ) as Record<SeatDirection, DiscardEntry[]>;

  const currentDirection = SEAT_DIRECTIONS.find(
    (direction) => seatAt(view.seat, direction) === view.currentSeat,
  );

  return { actionOptions, currentDirection, discards, extras, hasDockActions, seats };
}
