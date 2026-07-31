import type { RoomInfo } from "@new-mj/protocol";
import { motion } from "motion/react";
import { Button } from "@/shared/ui/button";

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
  myConfirmed: boolean;
  onConfirm: () => void;
  /** See RoundEndOverlay.tsx's `onEnd` doc — same room:end capability, same reasoning. */
  onEnd: () => void;
  /** See RoundEndOverlay.tsx's `entering` doc. */
  entering: boolean;
  reducedMotion: boolean;
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

const describeFan = (fanTypes: string[]): string =>
  fanTypes.map((type) => FAN_LABELS[type] ?? type).join(" + ");

const describeWinner = (
  detail: HangzhouWinDetail,
  result: Extract<HangzhouGameResultLike, { type: "win" }>,
  nameOf: (seat: number) => string,
): string => {
  const outcome =
    result.winType === "zimo" ? "won by self-draw" : `won off ${nameOf(result.from!)}'s discard`;
  return `${nameOf(detail.seat)} ${outcome} — ${describeFan(detail.fanTypes)} (×${detail.multiplier})`;
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
  myConfirmed,
  onConfirm,
  onEnd,
  entering,
  reducedMotion,
}: HangzhouRoundEndOverlayProps) {
  const nameOf = (seat: number) => players[seat]?.nickname ?? `Seat ${seat + 1}`;
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
        {result.type === "draw" ? (
          <p className="text-sm">Round drawn — the wall ran out.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {result.winners.map((detail) => (
              <li key={detail.seat}>{describeWinner(detail, result, nameOf)}</li>
            ))}
          </ul>
        )}
        <ul className="text-sm text-muted-foreground">
          {result.scoreDeltas.map((delta, seat) => (
            <li key={seat}>
              {nameOf(seat)}: {delta >= 0 ? "+" : ""}
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
