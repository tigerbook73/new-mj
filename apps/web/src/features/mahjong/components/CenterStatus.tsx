import { ScaleText } from "./ScaleText";

interface CenterStatusProps {
  phase: string;
  currentSeat: number;
  wallCount: number;
  error?: string | null;
  /**
   * Hangzhou-only private derived state (docs/variants/hangzhou.md §4) —
   * undefined for junk/bloodbattle, so no badge renders for them. Only ever
   * reflects the viewer's own hand; never sent for other seats.
   */
  isTingpai?: boolean | undefined;
  isBaotou?: boolean | undefined;
  isCaipiao?: boolean | undefined;
  /**
   * Hangzhou-only, public (docs/variants/hangzhou.md §5/§11) — how many
   * consecutive terms the current dealer has held, including this game.
   * Unlike isTingpai/isBaotou/isCaipiao, this is the same value in every
   * seat's view (santiao's ron restriction applies table-wide, not
   * per-seat), so it isn't a private badge — see the note near its render.
   */
  dealerStreak?: number | undefined;
}

const SANTIAO_UNLOCK_STREAK = 3;

const BADGE_CLASS =
  "rounded-full border px-2 py-0.5 text-[0.65rem] leading-none font-medium whitespace-nowrap";

export function CenterStatus({
  phase,
  currentSeat,
  wallCount,
  error,
  isTingpai,
  isBaotou,
  isCaipiao,
  dealerStreak,
}: CenterStatusProps) {
  const hasBadges = isTingpai || isBaotou || isCaipiao;
  // Only shown while ron is actually blocked — once santiao unlocks, this
  // table-wide restriction stops being news worth taking up space over.
  const gamesUntilSantiao =
    dealerStreak !== undefined && dealerStreak < SANTIAO_UNLOCK_STREAK
      ? SANTIAO_UNLOCK_STREAK - dealerStreak
      : undefined;
  return (
    <section
      data-testid="table-center-status"
      className="flex min-h-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border bg-background/90 p-2 text-center text-xs shadow-sm"
    >
      <ScaleText text={`Phase: ${phase}`} className="h-4 w-full" />
      <ScaleText
        text={`Turn: seat ${currentSeat + 1} · Wall: ${wallCount}`}
        className="h-4 w-full"
      />
      {gamesUntilSantiao !== undefined && (
        <div data-testid="santiao-status" className="h-4 w-full">
          <ScaleText
            text={`Santiao: ron unlocks in ${gamesUntilSantiao} more game${gamesUntilSantiao === 1 ? "" : "s"}`}
            className="h-4 w-full text-muted-foreground"
          />
        </div>
      )}
      {hasBadges && (
        <div data-testid="hangzhou-status-badges" className="flex flex-wrap justify-center gap-1">
          {/* 爆头 implies 听牌 — show only the stronger badge, not both. */}
          {isBaotou ? (
            <span className={`${BADGE_CLASS} border-amber-400 text-amber-600 dark:text-amber-400`}>
              爆头
            </span>
          ) : (
            isTingpai && (
              <span className={`${BADGE_CLASS} border-sky-400 text-sky-600 dark:text-sky-400`}>
                听牌
              </span>
            )
          )}
          {isCaipiao && (
            <span className={`${BADGE_CLASS} border-rose-400 text-rose-600 dark:text-rose-400`}>
              财飘
            </span>
          )}
        </div>
      )}
      {error && <ScaleText text={error} className="h-4 w-full text-destructive" />}
    </section>
  );
}
