import type { TableLayoutConfig } from "@/lib/tableLayoutLab";
import { sortTilesForDisplay } from "@/lib/mahjongTiles";
import { Tile } from "./Tile";

interface HandRowProps {
  /** Present only for the seat rendering as "bottom" (me) — everyone else only exposes handCount. */
  hand?: number[] | undefined;
  handCount: number;
  interactive?: boolean | undefined;
  onDiscard?: ((tile: number) => void) | undefined;
  /** Precomputed by the shared HandTrack shell (see components/mahjong/HandTrack.tsx) so the drawn-tile slot next to it always matches. */
  tileWidthPx: number;
  tileHeightPx: number;
  config: TableLayoutConfig;
}

export function HandRow({
  hand,
  handCount,
  interactive,
  onDiscard,
  tileWidthPx,
  tileHeightPx,
  config,
}: HandRowProps) {
  if (hand) {
    const displayHand = sortTilesForDisplay(hand);
    return (
      <div
        className="flex h-full w-full flex-nowrap items-center justify-end"
        style={{ gap: `${config.tiles.tileGapPx}px` }}
      >
        {displayHand.map((tile, index) => (
          <Tile
            key={`${tile}-${index}`}
            tileId={tile}
            widthPx={tileWidthPx}
            heightPx={tileHeightPx}
            clickable={interactive}
            onClick={interactive ? () => onDiscard?.(tile) : undefined}
            testId="hand-tile"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full items-center justify-end"
      style={{ gap: `${config.tiles.tileGapPx}px` }}
    >
      {Array.from({ length: handCount }, (_, index) => (
        <Tile key={index} back widthPx={tileWidthPx} heightPx={tileHeightPx} />
      ))}
    </div>
  );
}
