import type { SeatDirection } from "@/lib/seatLayout";
import { Tile } from "./Tile";

interface HandRowProps {
  direction: SeatDirection;
  /** Present only for the seat rendering as "bottom" (me) — everyone else only exposes handCount. */
  hand?: number[] | undefined;
  handCount: number;
  interactive?: boolean;
  onDiscard?: ((tile: number) => void) | undefined;
}

export function HandRow({ direction, hand, handCount, interactive, onDiscard }: HandRowProps) {
  const flexClass = direction === "left" || direction === "right" ? "flex-col" : "flex-row";

  if (hand) {
    return (
      <div className={`flex ${flexClass} flex-wrap items-center justify-center gap-0.5`}>
        {hand.map((tile, index) => (
          <Tile
            key={`${tile}-${index}`}
            tileId={tile}
            direction={direction}
            size="md"
            clickable={interactive}
            onClick={interactive ? () => onDiscard?.(tile) : undefined}
            testId="hand-tile"
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`flex ${flexClass} items-center justify-center gap-0.5`}>
      {Array.from({ length: handCount }, (_, index) => (
        <Tile key={index} back direction={direction} size="sm" />
      ))}
    </div>
  );
}
