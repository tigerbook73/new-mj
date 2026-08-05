import type { RoomInfo } from "@new-mj/protocol";
import { motion } from "motion/react";
import { Button } from "@/shared/ui/button";
import { WinningHandReveal } from "@/features/mahjong/components/WinningHandReveal";
import type { TileKind } from "@/features/mahjong/lib/mahjongTiles";
import { playerName, scoreRows, waitingPlayerNames } from "./roundEndPresentation";

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
  mySeat?: number;
  dealer?: number | undefined;
  myConfirmed: boolean;
  onConfirm: () => void;
  /** See RoundEndOverlay.tsx's `onEnd` doc — same room:end capability, same reasoning. */
  onEnd: () => void;
  /** See RoundEndOverlay.tsx's `entering` doc. */
  entering: boolean;
  reducedMotion: boolean;
  /**
   * Per-seat final hand (already-declared open melds + the concealed
   * decomposition actually used) plus the tile that completed it, indexed by
   * seat — undefined for a seat that didn't win. Assembled by TableView.tsx
   * from `view.seats` (melds + winSnapshot.groups/winTile).
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

// Keys are core's JunkFanType ids (junk.md §3) — the dealer's flat ×2 is not a
// fan type and only ever shows up inside scoreDeltas, so it has no label here.
const JUNK_FAN_LABELS: Record<string, string> = {
  gangkai: "杠开",
  hunyise: "混一色",
  qingyise: "清一色",
  qidui: "七小对",
  pengpenghu: "碰碰胡",
  menqing: "门清",
};

const JUNK_FAN_MULTIPLIERS: Record<string, string> = {
  hunyise: "×2",
  qingyise: "×4",
  qidui: "×2",
  pengpenghu: "×2",
  menqing: "×2",
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
  mySeat = 0,
  dealer,
  myConfirmed,
  onConfirm,
  onEnd,
  entering,
  reducedMotion,
  winningHands = [],
}: JunkRoundEndOverlayProps) {
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
        {result.type === "win" && (
          <ul className="text-sm text-muted-foreground">
            {result.winnerDetails.map((winner) => (
              <li key={winner.seat}>
                垃圾胡 · {dealer === undefined ? "庄家 ×2" : `庄家（${nameOf(dealer)}）×2`} ·{" "}
                {winner.fanTypes
                  .map((fan) => `${JUNK_FAN_LABELS[fan] ?? fan} ${JUNK_FAN_MULTIPLIERS[fan] ?? ""}`)
                  .join(" · ")}
                （合计 ×{winner.multiplier}）
              </li>
            ))}
          </ul>
        )}
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
