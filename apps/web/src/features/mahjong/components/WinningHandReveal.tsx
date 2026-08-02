import { cn } from "@/shared/lib/utils";
import {
  isCaishenKind,
  tileImageSrcForKind,
  type TileKind,
} from "@/features/mahjong/lib/mahjongTiles";
import { useTableLayoutStore } from "@/features/mahjong/tableLayout.store";

interface WinningHandRevealProps {
  /** Tile-kind groups to render as clusters (melds/pair, or seven pair-groups).
   * Read loosely off a seat's
   * `winSnapshot.groups` (protocol is intentionally untyped for ruleset-specific
   * fields), not imported from @new-mj/core (architecture rule 6). */
  groups: TileKind[][];
}

/**
 * Static reveal strip for a winner's final hand, grouped into the melds/pair
 * actually used for scoring. Plain `<img>` tiles (no TileFace/TileMotion) since
 * this never animates or responds to clicks — just a settlement-panel readout.
 */
export function WinningHandReveal({ groups }: WinningHandRevealProps) {
  const tileTheme = useTableLayoutStore((state) => state.tileTheme);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="flex gap-0.5">
          {group.map((kind, tileIndex) => (
            <img
              key={tileIndex}
              src={tileImageSrcForKind(kind, tileTheme)}
              alt={kind}
              draggable={false}
              className={cn(
                "h-8 w-6 rounded-[15%] border border-border bg-[#e8d4b0] object-fill shadow-sm",
                tileTheme === "Black" && "border-neutral-700 bg-neutral-950",
                isCaishenKind(kind) && "ring-2 ring-amber-400",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
