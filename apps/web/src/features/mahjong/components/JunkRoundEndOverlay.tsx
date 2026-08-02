import type { RoomInfo } from "@new-mj/protocol";
import { motion } from "motion/react";
import { Button } from "@/shared/ui/button";
import { WinningHandReveal } from "@/features/mahjong/components/WinningHandReveal";
import type { TileKind } from "@/features/mahjong/lib/mahjongTiles";

/**
 * junk's `JunkGameResult` shape (packages/core/src/rulesets/junk/types.ts),
 * read loosely off `view.result` the same way TableView reads `phase`/
 * `myClaimOptions` — not imported from @new-mj/core (architecture rule 6).
 * `winners` stays a numeric seat list for room/session compatibility, while
 * `winnerDetails` is the stable per-winner settlement snapshot used by this
 * panel after reconnect as well as on the first render.
 */
export type JunkWinDetail = {
  seat: number;
  fanTypes: string[];
  multiplier: number;
  payout: number;
};

export type JunkGameResultLike =
  | { type: "draw"; scoreDeltas: [number, number, number, number] }
  | {
      type: "win";
      winner: number;
      winners: number[];
      winnerDetails: JunkWinDetail[];
      winType: "zimo" | "ron";
      from?: number;
      scoreDeltas: [number, number, number, number];
    };

interface JunkRoundEndOverlayProps {
  result: JunkGameResultLike;
  gameNumber: number;
  totalGames: number;
  players: RoomInfo["players"];
  myConfirmed: boolean;
  onConfirm: () => void;
  /** See RoundEndOverlay.tsx's `onEnd` doc — same room:end capability, same reasoning. */
  onEnd: () => void;
  /** See RoundEndOverlay.tsx's `entering` doc. */
  entering: boolean;
  reducedMotion: boolean;
  /**
   * Per-seat final hand (already-declared open melds + the concealed
   * decomposition actually used), indexed by seat — undefined for a seat that
   * didn't win. Assembled by TableView.tsx from `view.seats` (melds +
   * winSnapshot.groups), see docs/process/plan.md 胡牌结算展示最终赢牌组合.
   * Optional so callers that don't care about the reveal (stories/tests)
   * don't need to pass it.
   */
  winningHands?: Array<TileKind[][] | undefined>;
}

const BACKDROP_INITIAL = { opacity: 0 };
const BACKDROP_ANIMATE = { opacity: 1 };
const BACKDROP_EXIT = { opacity: 0 };
const CARD_INITIAL = { opacity: 0, scale: 0.9, y: 16 };
const CARD_ANIMATE = { opacity: 1, scale: 1, y: 0 };
const CARD_EXIT = { opacity: 0, scale: 0.9, y: 16 };

const JUNK_FAN_LABELS: Record<string, string> = {
  dealer: "庄家胡",
  gangkai: "杠开",
  hunyise: "混一色",
  qingyise: "清一色",
  qidui: "七小对",
  pengpenghu: "碰碰胡",
  menqing: "门清",
};

const describeResult = (result: JunkGameResultLike, players: RoomInfo["players"]): string => {
  const nameOf = (seat: number) => players[seat]?.nickname ?? `Seat ${seat + 1}`;
  if (result.type === "draw") return "Round drawn — the wall ran out.";
  const winners = result.winners.map(nameOf).join(", ");
  return result.winType === "zimo"
    ? `${winners} won by self-draw.`
    : `${winners} won off ${nameOf(result.from!)}'s discard.`;
};

/**
 * Junk's own settlement panel — see RoundEndOverlay.tsx for the shared
 * layout/animation this mirrors. TableView.tsx picks between the two by
 * `room.rulesetId`, not a shared component, matching this project's
 * per-ruleset (not shared-and-branching) convention (see
 * HangzhouRoundEndOverlay.tsx, which established the pattern).
 */
export function JunkRoundEndOverlay({
  result,
  gameNumber,
  totalGames,
  players,
  myConfirmed,
  onConfirm,
  onEnd,
  entering,
  reducedMotion,
  winningHands = [],
}: JunkRoundEndOverlayProps) {
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
        {result.type === "win" && (
          <ul className="text-sm text-muted-foreground">
            {result.winnerDetails.map((winner) => (
              <li key={winner.seat}>
                {players[winner.seat]?.nickname ?? `Seat ${winner.seat + 1}`}:{" "}
                {winner.fanTypes.map((fan) => JUNK_FAN_LABELS[fan] ?? fan).join(" · ")} ×
                {winner.multiplier}
              </li>
            ))}
          </ul>
        )}
        {result.type === "win" &&
          result.winners
            .filter((seat) => winningHands[seat])
            .map((seat) => <WinningHandReveal key={seat} groups={winningHands[seat]!} />)}
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
