import type { RoomInfo } from "@new-mj/protocol";
import { motion } from "motion/react";
import { Button } from "@/shared/ui/button";

/**
 * junk's `JunkGameResult` shape (packages/core/src/rulesets/junk/types.ts),
 * read loosely off `view.result` the same way TableView reads `phase`/
 * `myClaimOptions` — not imported from @new-mj/core (architecture rule 6).
 */
type GameResultLike =
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
}

const BACKDROP_INITIAL = { opacity: 0 };
const BACKDROP_ANIMATE = { opacity: 1 };
const BACKDROP_EXIT = { opacity: 0 };
const CARD_INITIAL = { opacity: 0, scale: 0.9, y: 16 };
const CARD_ANIMATE = { opacity: 1, scale: 1, y: 0 };
const CARD_EXIT = { opacity: 0, scale: 0.9, y: 16 };

const describeResult = (result: GameResultLike, players: RoomInfo["players"]): string => {
  const nameOf = (seat: number) => players[seat]?.nickname ?? `Seat ${seat + 1}`;
  if (result.type === "draw") return "Round drawn — the wall ran out.";
  const winners = result.winners.map(nameOf).join(", ");
  return result.winType === "zimo"
    ? `${winners} won by self-draw.`
    : `${winners} won off ${nameOf(result.from!)}'s discard.`;
};

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
  myConfirmed,
  onConfirm,
  onEnd,
  entering,
  reducedMotion,
}: RoundEndOverlayProps) {
  const waitingOn = players
    .map((player, seat) => ({ player, seat }))
    .filter(({ player }) => player && !player.isBot && player.isReady !== true)
    .map(({ player, seat }) => player?.nickname ?? `Seat ${seat + 1}`);
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
        <h2 className="text-lg font-semibold">
          Game {gameNumber} of {totalGames} finished
        </h2>
        <p className="text-sm">{describeResult(result, players)}</p>
        <ul className="text-sm text-muted-foreground">
          {result.scoreDeltas.map((delta, seat) => (
            <li key={seat}>
              {players[seat]?.nickname ?? `Seat ${seat + 1}`}: {delta >= 0 ? "+" : ""}
              {delta}
            </li>
          ))}
        </ul>
        {myConfirmed ? (
          <p className="text-sm text-muted-foreground">
            {waitingOn.length > 0
              ? `Waiting for: ${waitingOn.join(", ")}…`
              : "Starting next round…"}
          </p>
        ) : (
          <Button onClick={onConfirm}>Next round</Button>
        )}
        <Button variant="outline" onClick={onEnd}>
          End session
        </Button>
      </motion.div>
    </motion.div>
  );
}
