import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { tileBackImageSrc, tileImageSrc } from "@/lib/mahjongTiles";
import { useTableLayoutStore } from "@/store/tableLayout";

const tileVariants = cva(
  "relative inline-block shrink-0 select-none overflow-hidden rounded-[15%] border border-border bg-[#e8d4b0] shadow-md",
  {
    variants: {
      clickable: {
        true: "cursor-pointer transition-transform hover:-translate-y-1",
        false: "",
      },
      selected: { true: "-translate-y-2 ring-2 ring-primary", false: "" },
      dimmed: { true: "opacity-40", false: "" },
      /** The single most recent discard on the table (view.lastDiscard) — see DiscardPile. */
      justDiscarded: {
        true: "ring-2 ring-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,0.55)]",
        false: "",
      },
    },
    defaultVariants: { clickable: false, selected: false, dimmed: false, justDiscarded: false },
  },
);

export interface TileProps extends VariantProps<typeof tileVariants> {
  /** Omit (or set `back`) to render a face-down tile. */
  tileId?: number;
  back?: boolean;
  /**
   * Exact pixel box for this tile. Callers on the real board
   * (HandRow/MeldGroup/DiscardPile) always receive this from a shared
   * fitTileGrid computation (HandTrack/MeldInfoTrack/DiscardPile itself); the
   * default here only covers a bare standalone <Tile/> (e.g. a Storybook
   * fixture with no surrounding grid).
   */
  widthPx?: number;
  heightPx?: number;
  onClick?: (() => void) | undefined;
  className?: string;
  testId?: string;
}

/**
 * Always rendered upright, in local (unrotated) coordinates. Any per-seat
 * visual rotation is applied by the ancestor DirectionalSurface to the
 * whole region at once, not per tile — see components/mahjong/TableGeometry.tsx.
 */
export function Tile({
  tileId,
  back = false,
  widthPx = 44,
  heightPx = 59,
  clickable,
  selected,
  dimmed,
  justDiscarded,
  onClick,
  className,
  testId,
}: TileProps) {
  const tileTheme = useTableLayoutStore((state) => state.tileTheme);
  const isBack = back || tileId === undefined;
  const isClickable = (clickable ?? Boolean(onClick)) && !isBack;
  const src = isBack ? tileBackImageSrc(tileTheme) : tileImageSrc(tileId!, tileTheme);

  return (
    <div
      data-testid={testId}
      data-tile-id={isBack ? undefined : tileId}
      className={cn(
        tileVariants({ clickable: isClickable, selected, dimmed, justDiscarded }),
        tileTheme === "Black" && "border-neutral-700 bg-neutral-950",
        className,
      )}
      style={{ width: widthPx, height: heightPx }}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <img
        src={src}
        alt={isBack ? "" : String(tileId)}
        draggable={false}
        className="absolute inset-0 h-full w-full object-fill"
      />
    </div>
  );
}
