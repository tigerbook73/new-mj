import type { SeatDirection } from "@/lib/seatLayout";
import { Tile } from "./Tile";

interface HandRowProps {
  direction: SeatDirection;
  /** See SeatContent.handTiles (components/mahjong/TableBoard.tsx) for the slot layout. */
  handTiles: number[];
  revealed: boolean;
  interactive?: boolean | undefined;
  onDiscard?: ((tile: number) => void) | undefined;
  tileHeightPct: number;
  tileGapPx: number;
}

/**
 * One flat, right-anchored row for every seat. The trailing slot (index
 * length-1) is always the pinned just-drawn tile or an empty gap-sized
 * placeholder; the one before it is always an empty spacer — both come
 * pre-baked into `handTiles` (see useTablePresentation.ts) so this component
 * never has to reason about drawn-tile state itself.
 */
export function HandRow({
  direction,
  handTiles,
  revealed,
  interactive,
  onDiscard,
  tileHeightPct,
  tileGapPx,
}: HandRowProps) {
  const drawnIndex = handTiles.length - 1;
  return (
    <div
      className="flex h-full w-full flex-nowrap items-center justify-end"
      style={{ gap: `${tileGapPx}px` }}
    >
      {handTiles.map((tileId, index) => {
        const isPlaceholder = tileId < 0;
        const isReal = revealed && !isPlaceholder;
        const isDrawnSlot = index === drawnIndex;
        return (
          <Tile
            key={index}
            tileId={tileId}
            back={!revealed && !isPlaceholder}
            heightPx={`${tileHeightPct}%`}
            clickable={interactive && isReal}
            {...(interactive && isReal ? { onClick: () => onDiscard?.(tileId) } : {})}
            {...(isDrawnSlot
              ? { testId: `hand-track-drawn-${direction}` }
              : isReal
                ? { testId: "hand-tile" }
                : {})}
          />
        );
      })}
    </div>
  );
}
