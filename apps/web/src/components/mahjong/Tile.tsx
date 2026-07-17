import type { CSSProperties } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { tileBackImageSrc, tileImageSrc } from "@/lib/mahjongTiles";
import type { SeatDirection } from "@/lib/seatLayout";
import { useTableLayoutStore } from "@/store/tableLayout";

const SIZE_SCALE = { sm: 55, md: 75, lg: 95 } as const;
type TileSize = keyof typeof SIZE_SCALE;

const ASPECT_PORTRAIT = "aspect-[3/4]";
const ASPECT_LANDSCAPE = "aspect-[4/3]";

const ROTATE_CLASS: Record<SeatDirection, string> = {
  bottom: "rotate-0",
  left: "rotate-90",
  top: "rotate-180",
  right: "-rotate-90",
};

const tileVariants = cva(
  "relative inline-block shrink-0 select-none overflow-hidden rounded-[15%] border border-border bg-card shadow-sm",
  {
    variants: {
      clickable: {
        true: "cursor-pointer transition-transform hover:-translate-y-1",
        false: "",
      },
      selected: { true: "-translate-y-2 ring-2 ring-primary", false: "" },
      dimmed: { true: "opacity-40", false: "" },
    },
    defaultVariants: { clickable: false, selected: false, dimmed: false },
  },
);

export interface TileProps extends VariantProps<typeof tileVariants> {
  /** Omit (or set `back`) to render a face-down tile. */
  tileId?: number;
  back?: boolean;
  direction?: SeatDirection;
  size?: TileSize;
  onClick?: (() => void) | undefined;
  className?: string;
  testId?: string;
}

export function Tile({
  tileId,
  back = false,
  direction = "bottom",
  size = "md",
  clickable,
  selected,
  dimmed,
  onClick,
  className,
  testId,
}: TileProps) {
  const tileUnit = useTableLayoutStore((state) => state.tileUnit);
  const isVertical = direction === "left" || direction === "right";
  const isBack = back || tileId === undefined;
  const isClickable = (clickable ?? Boolean(onClick)) && !isBack;
  const scale = (tileUnit * SIZE_SCALE[size]) / 100;

  const containerStyle = { [isVertical ? "height" : "width"]: scale } as CSSProperties;
  const imageStyle = { width: scale };

  const src = isBack ? tileBackImageSrc() : tileImageSrc(tileId!);

  return (
    <div
      data-testid={testId}
      data-tile-id={isBack ? undefined : tileId}
      className={cn(
        tileVariants({ clickable: isClickable, selected, dimmed }),
        isVertical ? ASPECT_LANDSCAPE : ASPECT_PORTRAIT,
        className,
      )}
      style={containerStyle}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <img
        src={src}
        alt={isBack ? "" : String(tileId)}
        draggable={false}
        style={imageStyle}
        className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain",
          ASPECT_PORTRAIT,
          ROTATE_CLASS[direction],
        )}
      />
    </div>
  );
}
