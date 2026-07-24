import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { tileBackImageSrc, tileImageSrc } from "@/lib/mahjongTiles";
import { useTableLayoutStore } from "@/store/tableLayout";

const tileVariants = cva(
  "relative inline-block shrink-0 select-none overflow-hidden rounded-[15%] border border-border bg-[#e8d4b0] shadow-md",
  {
    variants: {
      clickable: {
        // Centered enlargement expands the hit target instead of moving it
        // away from the pointer, unlike the old upward translation.
        true: "origin-bottom cursor-pointer transition-[transform,border-color,box-shadow] hover:z-10 hover:scale-[1.2] hover:border-cyan-400 hover:ring-2 hover:ring-cyan-300 hover:shadow-lg",
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

/** Height / width of a real mahjong tile face — mirrors tableLayoutLab.ts's `tiles.aspectRatio` default. */
const DEFAULT_TILE_ASPECT_RATIO = 1.333;

export interface TileProps extends VariantProps<typeof tileVariants> {
  /** Omit (or set `back`) to render a face-down tile. */
  tileId?: number;
  back?: boolean;
  /**
   * Pixel (or CSS percentage) box for this tile. Give both for an exact box
   * (what the real board's fitTileGrid callers do); give only one and the
   * other is derived by the browser via CSS `aspect-ratio` instead of the
   * caller having to compute it.
   */
  widthPx?: number | string;
  heightPx?: number | string;
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
  widthPx,
  heightPx,
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
  const hasWidth = widthPx !== undefined;
  const hasHeight = heightPx !== undefined;

  return (
    <div
      data-testid={testId}
      data-tile-id={isBack ? undefined : tileId}
      className={cn(
        tileVariants({ clickable: isClickable, selected, dimmed, justDiscarded }),
        tileTheme === "Black" && "border-neutral-700 bg-neutral-950",
        className,
      )}
      style={{
        width: hasWidth ? widthPx : !hasHeight ? 44 : undefined,
        height: hasHeight ? heightPx : !hasWidth ? 59 : undefined,
        // Only relevant when exactly one side was omitted — that's what lets
        // the browser derive it. Both given (the real board's usual case) or
        // neither given (bare defaults above) both fully determine the box
        // already, so aspect-ratio has nothing left to do.
        aspectRatio: hasWidth === hasHeight ? undefined : `1 / ${DEFAULT_TILE_ASPECT_RATIO}`,
      }}
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
