import type { SeatDirection } from "@/lib/seatLayout";
import { Tile } from "./Tile";

export type Meld = { type: string; tiles: number[]; from?: number };

interface MeldGroupProps {
  direction: SeatDirection;
  melds: Meld[];
}

export function MeldGroup({ direction, melds }: MeldGroupProps) {
  if (melds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {melds.map((meld, meldIndex) => (
        <div key={meldIndex} className="flex gap-0.5">
          {meld.tiles.map((tile, tileIndex) => (
            <Tile key={`${tile}-${tileIndex}`} tileId={tile} direction={direction} size="sm" />
          ))}
        </div>
      ))}
    </div>
  );
}
