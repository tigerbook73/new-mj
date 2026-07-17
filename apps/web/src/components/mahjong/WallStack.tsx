import type { SeatDirection } from "@/lib/seatLayout";
import { Tile } from "./Tile";

interface WallStackProps {
  direction: SeatDirection;
  count: number;
}

/** Purely decorative — only the aggregate wallCount, never any tile identity. */
export function WallStack({ direction, count }: WallStackProps) {
  const flexClass = direction === "left" || direction === "right" ? "flex-col" : "flex-row";

  return (
    <div className={`flex ${flexClass} items-center justify-center gap-0.5`}>
      {Array.from({ length: count }, (_, index) => (
        <Tile key={index} back direction={direction} size="sm" />
      ))}
    </div>
  );
}
