import { cn } from "@/shared/lib/utils";
import {
  isCaishenKind,
  tileImageSrcForKind,
  type TileKind,
} from "@/features/mahjong/lib/mahjongTiles";
import { useTableLayoutStore } from "@/features/mahjong/tableLayout.store";

/** First group/tile-index whose kind matches `winTile`, or undefined if there's
 * no winTile (bloodbattle doesn't wire one yet) or it isn't found. */
function findWinTileLocation(
  groups: TileKind[][],
  winTile: TileKind | undefined,
): { groupIndex: number; tileIndex: number } | undefined {
  if (winTile === undefined) return undefined;
  for (const [groupIndex, group] of groups.entries()) {
    const tileIndex = group.indexOf(winTile);
    if (tileIndex !== -1) return { groupIndex, tileIndex };
  }
  return undefined;
}

interface WinningHandRevealProps {
  /** Tile-kind groups to render as clusters (melds/pair, or seven pair-groups).
   * Read loosely off a seat's
   * `winSnapshot.groups` (protocol is intentionally untyped for ruleset-specific
   * fields), not imported from @new-mj/core (architecture rule 6). */
  groups: TileKind[][];
  /** The physical tile that completed the hand (self-drawn or claimed via
   * ron) — `seat.winSnapshot.winTile`. Kind-level like `groups`, so if that
   * kind recurs elsewhere in the hand only the first occurrence is
   * highlighted; there's no TileId here to disambiguate identical copies. */
  winTile?: TileKind | undefined;
}

/**
 * Static reveal strip for a winner's final hand, grouped into the melds/pair
 * actually used for scoring. Plain `<img>` tiles (no TileFace/TileMotion) since
 * this never animates or responds to clicks — just a settlement-panel readout.
 */
export function WinningHandReveal({ groups, winTile }: WinningHandRevealProps) {
  const tileTheme = useTableLayoutStore((state) => state.tileTheme);
  // Precomputed once (not mutated mid-render, see eslint react-hooks/
  // immutability): the first group/tile-index whose kind matches winTile.
  const winTileLocation = findWinTileLocation(groups, winTile);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="flex gap-0.5">
          {group.map((kind, tileIndex) => {
            const isWinTile =
              winTileLocation?.groupIndex === groupIndex && winTileLocation.tileIndex === tileIndex;
            return (
              <img
                key={tileIndex}
                src={tileImageSrcForKind(kind, tileTheme)}
                alt={kind}
                draggable={false}
                className={cn(
                  "h-8 w-6 rounded-[15%] border border-border bg-[#e8d4b0] object-fill shadow-sm",
                  tileTheme === "Black" && "border-neutral-700 bg-neutral-950",
                  isCaishenKind(kind) && "ring-2 ring-amber-400",
                  // Same red ring + glow TileFace's `justDiscarded` variant uses
                  // elsewhere on the live table — this project's established
                  // "the noteworthy tile" visual language, reused here since
                  // this strip doesn't route through TileFace/cva at all.
                  isWinTile &&
                    "z-10 ring-2 ring-red-500 shadow-[0_0_10px_2px_rgba(251,191,36,0.55)]",
                )}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
