import type { ReactNode } from "react";
import { ScaleText } from "./ScaleText";

/**
 * Ruleset-private derived flag rendered as a small pill — see docs/variants/hangzhou.md §4.
 * CenterStatus only renders whatever list it's given; which flags exist, their precedence
 * (e.g. 爆头 implying 听牌), and their color accents are entirely the caller's call, so this
 * component never needs updating when a ruleset adds a new one.
 */
export interface StatusBadge {
  key: string;
  label: string;
  icon: ReactNode;
  /** Color accent classes, e.g. "border-amber-400 text-amber-600 dark:text-amber-400". */
  className?: string;
}

interface CenterStatusProps {
  phase: string;
  wallCount: number;
  error?: string | null | undefined;
  /**
   * Hangzhou-only, public (docs/variants/hangzhou.md §5/§11) — how many consecutive terms
   * the current dealer has held, including this game. Same value in every seat's view
   * (santiao's ron restriction applies table-wide, not per-seat), so it isn't a private badge.
   */
  dealerStreak?: number | undefined;
  badges?: StatusBadge[] | undefined;
}

const PHASE_LABELS: Record<string, string> = {
  dealing: "发牌中",
  exchanging: "换三张",
  "choosing-lack": "定缺中",
  playing: "进行中",
  "awaiting-claims": "待响应",
  "awaiting-draw": "摸牌中",
  finished: "已结束",
};

export function CenterStatus({ phase, wallCount, error, dealerStreak, badges }: CenterStatusProps) {
  return (
    <section
      data-testid="table-center-status"
      className="flex h-full w-full flex-col items-center justify-center gap-[4cqmin] overflow-hidden rounded-lg border bg-background/90 p-[7cqmin] text-center shadow-sm"
      style={{ containerType: "size" }}
    >
      <span className="rounded-full bg-primary/10 px-[5cqmin] py-[1.6cqmin] text-[10cqmin] leading-tight font-semibold whitespace-nowrap text-primary">
        {PHASE_LABELS[phase] ?? phase}
      </span>
      <div className="flex items-baseline gap-[2cqmin]">
        <span className="text-[20cqmin] leading-none font-extrabold tabular-nums">{wallCount}</span>
        <span className="text-[7cqmin] leading-none font-medium text-muted-foreground">张</span>
      </div>
      {dealerStreak !== undefined && (
        <span
          data-testid="dealer-streak-chip"
          className="rounded-full bg-muted px-[4cqmin] py-[1.4cqmin] text-[6cqmin] leading-tight font-semibold whitespace-nowrap text-muted-foreground"
        >
          连庄 {dealerStreak}
        </span>
      )}
      {badges && badges.length > 0 && (
        <div
          data-testid="status-badges"
          className="flex w-full flex-wrap justify-center gap-[2cqmin] border-t pt-[3cqmin]"
        >
          {badges.map((badge) => (
            <span
              key={badge.key}
              className={`inline-flex items-center gap-[1.2cqmin] rounded-full border px-[3cqmin] py-[1cqmin] text-[5.6cqmin] leading-tight font-medium whitespace-nowrap ${badge.className ?? ""}`}
            >
              {badge.icon}
              {badge.label}
            </span>
          ))}
        </div>
      )}
      {error && <ScaleText text={error} className="h-4 w-full text-destructive" />}
    </section>
  );
}
