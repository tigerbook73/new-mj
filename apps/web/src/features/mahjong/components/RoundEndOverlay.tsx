import type { RoomInfo } from "@new-mj/protocol";
import { motion } from "motion/react";
import { Button } from "@/shared/ui/button";
import { WinningHandReveal } from "@/features/mahjong/components/WinningHandReveal";
import type { TileKind } from "@/features/mahjong/lib/mahjongTiles";
import { playerName, scoreRows, waitingPlayerNames } from "./roundEndPresentation";

/**
 * bloodbattle's game-result shape (packages/core/src/rulesets/bloodbattle/
 * types.ts), read loosely off `view.result` the same way TableView reads
 * `phase`/`myClaimOptions` — not imported from @new-mj/core (architecture
 * rule 6). `winners` here is a plain seat-number array — junk and hangzhou
 * each score a per-winner fan breakdown instead and use their own overlay
 * component (JunkRoundEndOverlay.tsx / HangzhouRoundEndOverlay.tsx).
 */
export type GameResultLike =
  | { type: "draw"; scoreDeltas: [number, number, number, number] }
  | {
      type: "win";
      winner: number;
      winners: number[];
      winType: "zimo" | "ron";
      from?: number;
      scoreDeltas: [number, number, number, number];
    };

interface RoundEndOverlayProps {
  result: GameResultLike;
  gameNumber: number;
  totalGames: number;
  players: RoomInfo["players"];
  mySeat?: number;
  myConfirmed: boolean;
  onConfirm: () => void;
  /**
   * room:end — ends the whole session right now instead of waiting for
   * `totalGames` to play out. Any seated player may call this, confirmed
   * or not (session-mechanics.md §6 "提前结束整场对局"), so the button
   * always renders regardless of `myConfirmed`.
   */
  onEnd: () => void;
  /**
   * Plays the mount-in transition — false for a reconnect/backlog snap that
   * resumes with the overlay already showing (see
   * useIsIncrementalSnapshot/usePrefersReducedMotion), same convention as
   * Tile.tsx's `entering`. The exit transition (this component unmounting
   * under TableView's `<AnimatePresence>` when the next round starts or the
   * session ends) always plays regardless — it's only ever reached via a
   * live, already-loaded page transition, never a reconnect.
   */
  entering: boolean;
  /** Collapses both the enter and exit transition to instant — see usePrefersReducedMotion. */
  reducedMotion: boolean;
  /**
   * Per-seat final hand (already-declared open melds + the concealed
   * decomposition actually used) plus the tile that completed it, indexed by
   * seat — undefined for a seat that didn't win. Assembled by TableView.tsx
   * from `view.seats` (melds + winSnapshot.groups/winTile).
   * bloodbattle has no winSnapshot wiring yet, so this is always empty there.
   * Optional so callers that don't care about the reveal (stories/tests)
   * don't need to pass it.
   */
  winningHands?: Array<{ groups: TileKind[][]; winTile: TileKind } | undefined>;
}

const BACKDROP_INITIAL = { opacity: 0 };
const BACKDROP_ANIMATE = { opacity: 1 };
const BACKDROP_EXIT = { opacity: 0 };
const CARD_INITIAL = { opacity: 0, scale: 0.9, y: 16 };
const CARD_ANIMATE = { opacity: 1, scale: 1, y: 0 };
const CARD_EXIT = { opacity: 0, scale: 0.9, y: 16 };

/**
 * Shown while `RoomService.awaitingNextRound` is true (docs/contracts/
 * session-mechanics.md §6 局间确认) — every real seat must confirm via the
 * existing room:ready before the server deals the next game.
 */
export function RoundEndOverlay({
  result,
  gameNumber,
  totalGames,
  players,
  mySeat = 0,
  myConfirmed,
  onConfirm,
  onEnd,
  entering,
  reducedMotion,
  winningHands = [],
}: RoundEndOverlayProps) {
  const waitingOn = waitingPlayerNames(players, mySeat);
  const nameOf = (seat: number) => playerName(players, mySeat, seat);
  const transition = { duration: reducedMotion ? 0 : 0.25, ease: "easeOut" } as const;

  return (
    <motion.div
      data-testid="round-end-overlay"
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      initial={entering ? BACKDROP_INITIAL : false}
      animate={BACKDROP_ANIMATE}
      exit={BACKDROP_EXIT}
      transition={transition}
    >
      <motion.div
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-background p-5 text-center shadow-xl"
        initial={entering ? CARD_INITIAL : false}
        animate={CARD_ANIMATE}
        exit={CARD_EXIT}
        transition={transition}
      >
        <p className="text-sm text-muted-foreground">
          第 {gameNumber} / {totalGames} 局
        </p>
        <h2 className="text-lg font-semibold">
          {result.type === "draw"
            ? "流局"
            : `${result.winners.map(nameOf).join("、")}${result.winType === "zimo" ? " 自摸" : " 胡牌"}`}
          {result.type === "win" && result.winType === "ron"
            ? `（${nameOf(result.from!)} 点炮）`
            : ""}
        </h2>
        {result.type === "win" &&
          result.winners
            .filter((seat) => winningHands[seat])
            .map((seat) => (
              <WinningHandReveal
                key={seat}
                groups={winningHands[seat]!.groups}
                winTile={winningHands[seat]!.winTile}
              />
            ))}
        <ul className="text-sm text-muted-foreground">
          {scoreRows(result.scoreDeltas, result.type === "win" ? result.winners : []).map(
            (seat) => (
              <li key={seat}>
                {nameOf(seat)}: {result.scoreDeltas[seat]! >= 0 ? "+" : ""}
                {result.scoreDeltas[seat]}
              </li>
            ),
          )}
        </ul>
        {myConfirmed ? (
          <p className="text-sm text-muted-foreground">
            {waitingOn.length > 0
              ? `Waiting for: ${waitingOn.join(", ")}…`
              : "Starting next round…"}
          </p>
        ) : (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onConfirm}>
              下一局
            </Button>
            <Button className="flex-1" variant="outline" onClick={onEnd}>
              结束
            </Button>
          </div>
        )}
        {myConfirmed && (
          <Button variant="outline" onClick={onEnd}>
            结束
          </Button>
        )}
      </motion.div>
    </motion.div>
  );
}
