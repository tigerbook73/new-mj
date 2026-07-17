import type { SeatDirection } from "@/lib/seatLayout";
import { Tile } from "./Tile";

export type DiscardEntry = { tile: number; claimedBy?: number };

interface DiscardPileProps {
  direction: SeatDirection;
  discards: DiscardEntry[];
}

/** claimedBy'd entries stay in the pile (tombstone — see DiscardEntry docs), just dimmed. */
export function DiscardPile({ direction, discards }: DiscardPileProps) {
  const flexClass = direction === "left" || direction === "right" ? "flex-col" : "flex-row";

  return (
    <div className={`flex ${flexClass} flex-wrap items-center justify-center gap-0.5`}>
      {discards.map((entry, index) => (
        <Tile
          key={`${entry.tile}-${index}`}
          tileId={entry.tile}
          direction={direction}
          size="sm"
          dimmed={entry.claimedBy !== undefined}
        />
      ))}
    </div>
  );
}
