import type { RoomInfo } from "@new-mj/protocol";
import { motion } from "motion/react";
import { Button } from "@/shared/ui/button";
import { WinningHandReveal } from "@/features/mahjong/components/WinningHandReveal";
import type { TileKind } from "@/features/mahjong/lib/mahjongTiles";
import { playerName, scoreRows, waitingPlayerNames } from "./roundEndPresentation";

/**
 * hangzhou's `HangzhouGameResult` shape (packages/core/src/rulesets/hangzhou/
 * types.ts), read loosely off `view.result` the same way TableView reads
 * `phase`/`myClaimOptions` — not imported from @new-mj/core (architecture
 * rule 6). `winners` here is an array of per-winner fan breakdowns, not the
 * plain seat-number array junk/bloodbattle use (see RoundEndOverlay.tsx) —
 * that shape mismatch is exactly why hangzhou needs its own component rather
 * than reusing the generic one.
 */
export type HangzhouWinDetail = {
  seat: number;
  fanTypes: string[];
  multiplier: number;
  payout: number;
};

export type HangzhouGameResultLike =
  | { type: "draw"; scoreDeltas: [number, number, number, number] }
  | {
      type: "win";
      winner: number;
      winners: HangzhouWinDetail[];
      winType: "zimo" | "ron";
      from?: number;
      scoreDeltas: [number, number, number, number];
    };

interface HangzhouRoundEndOverlayProps {
  result: HangzhouGameResultLike;
  gameNumber: number;
  totalGames: number;
  players: RoomInfo["players"];
  mySeat?: number;
  dealer?: number | undefined;
  dealerStreak?: number | undefined;
  myConfirmed: boolean;
  onConfirm: () => void;
  /** See RoundEndOverlay.tsx's `onEnd` doc — same room:end capability, same reasoning. */
  onEnd: () => void;
  /** See RoundEndOverlay.tsx's `entering` doc. */
  entering: boolean;
  reducedMotion: boolean;
  /**
   * Per-seat final hand (already-declared open melds + the concealed
   * decomposition actually used for scoring), indexed by seat — undefined for
   * a seat that didn't win. Assembled by TableView.tsx from `view.seats`
   * (melds + winSnapshot.groups).
   * Optional so callers that don't care about the reveal (stories/tests) don't
   * need to pass it.
   */
  winningHands?: Array<TileKind[][] | undefined>;
}

const BACKDROP_INITIAL = { opacity: 0 };
const BACKDROP_ANIMATE = { opacity: 1 };
const BACKDROP_EXIT = { opacity: 0 };
const CARD_INITIAL = { opacity: 0, scale: 0.9, y: 16 };
const CARD_ANIMATE = { opacity: 1, scale: 1, y: 0 };
const CARD_EXIT = { opacity: 0, scale: 0.9, y: 16 };

// docs/variants/hangzhou.md §6 — machine-readable fan codes to Chinese labels.
// Not shared with bloodbattle's own (English) fanTypes: each ruleset keeps its
// own table rather than a shared translation layer (architecture/variant-boundary.md).
const FAN_LABELS: Record<string, string> = {
  pinghu: "平胡",
  baotou: "爆头",
  caipiao: "财飘",
  shuangCaipiao: "双财飘",
  sanCaipiao: "三财飘",
  qiduizi: "七对子",
  haohuaQiduizi: "豪华七对子",
  shuangHaohuaQiduizi: "双豪华七对子",
  sanHaohuaQiduizi: "三豪华七对子",
  gangkai: "杠开",
  erLianGang: "二连杠",
  sanLianGang: "三连杠",
  siLianGang: "四连杠",
};

const FAN_MULTIPLIERS: Record<string, number> = {
  pinghu: 1,
  baotou: 2,
  caipiao: 4,
  shuangCaipiao: 8,
  sanCaipiao: 16,
  qiduizi: 2,
  haohuaQiduizi: 4,
  shuangHaohuaQiduizi: 8,
  sanHaohuaQiduizi: 16,
  gangkai: 2,
  erLianGang: 4,
  sanLianGang: 8,
  siLianGang: 16,
};

/**
 * Hangzhou's own settlement panel — see RoundEndOverlay.tsx for the shared
 * layout/animation this mirrors. TableView.tsx picks between the two by
 * `room.rulesetId`, not a shared component, matching this project's
 * per-ruleset (not shared-and-branching) convention.
 */
export function HangzhouRoundEndOverlay({
  result,
  gameNumber,
  totalGames,
  players,
  mySeat = 0,
  dealer,
  dealerStreak,
  myConfirmed,
  onConfirm,
  onEnd,
  entering,
  reducedMotion,
  winningHands = [],
}: HangzhouRoundEndOverlayProps) {
  const nameOf = (seat: number) => playerName(players, mySeat, seat);
  const waitingOn = waitingPlayerNames(players, mySeat);
  const dealerMultiplier = dealerStreak === undefined ? 2 : 2 ** Math.min(dealerStreak, 3);
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
        {result.type === "draw" ? (
          <h2 className="text-lg font-semibold">流局</h2>
        ) : (
          <>
            <h2 className="text-lg font-semibold">
              {result.winners.map((detail) => nameOf(detail.seat)).join("、")}
              {result.winType === "zimo" ? " 自摸" : ` 胡牌（${nameOf(result.from!)} 点炮）`}
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              {result.winners.map((detail) => (
                <li key={detail.seat} className="flex flex-col items-center gap-1">
                  {winningHands[detail.seat] && (
                    <WinningHandReveal groups={winningHands[detail.seat]!} />
                  )}
                  <span className="text-muted-foreground">
                    杭州麻将 · {dealer === undefined ? "庄家" : `庄家（${nameOf(dealer)}）`} ×
                    {dealerMultiplier} ·{" "}
                    {detail.fanTypes
                      .map((type) => `${FAN_LABELS[type] ?? type} ×${FAN_MULTIPLIERS[type] ?? "?"}`)
                      .join(" · ")}
                    （合计 ×{detail.multiplier}）
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <ul className="text-sm text-muted-foreground">
          {scoreRows(
            result.scoreDeltas,
            result.type === "win" ? result.winners.map(({ seat }) => seat) : [],
          ).map((seat) => (
            <li key={seat}>
              {nameOf(seat)}: {result.scoreDeltas[seat]! >= 0 ? "+" : ""}
              {result.scoreDeltas[seat]}
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
