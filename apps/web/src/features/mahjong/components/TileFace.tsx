import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";
import { tileBackImageSrc, tileImageSrc } from "@/features/mahjong/lib/mahjongTiles";
import { useTableLayoutStore } from "@/features/mahjong/tableLayout.store";

const tileVariants = cva(
  // `opacity`/`transform` transition `dimmed`/`enlarged`/hover-scale smoothly
  // (all plain CSS now — see this file's own docs for why, versus the old
  // single-node version that had to route them through motion's `animate`);
  // `box-shadow`/`border-color` cover `justDiscarded`'s ring and clickable's
  // hover feedback the same way they always did.
  "relative h-full w-full select-none overflow-hidden rounded-[15%] border border-border bg-[#e8d4b0] shadow-md transition-[opacity,transform,box-shadow,border-color]",
  {
    variants: {
      clickable: {
        true: "origin-bottom cursor-pointer hover:z-10 hover:scale-[1.2] hover:border-cyan-400 hover:ring-2 hover:ring-cyan-300 hover:shadow-lg",
        false: "",
      },
      // NOTE: if this ever gets wired up (currently unused — no caller
      // passes `selected`), `-translate-y-2` would need the same treatment
      // as `enlarged` below (a plain CSS class, not motion).
      selected: { true: "ring-2 ring-primary", false: "" },
      /**
       * The single most recent discard on the table (view.lastDiscard) — see
       * DiscardPile — or, in ActionDock, a claim's target tile among its
       * candidate row. `z-10` so DiscardPile's accompanying scale-up (see
       * `enlarged`) renders on top of its grid neighbors instead of being
       * clipped underneath them, same reasoning as `clickable`'s `hover:z-10`
       * — a harmless no-op for ActionDock's unscaled usage.
       */
      justDiscarded: {
        true: "z-10 ring-2 ring-red-500 shadow-[0_0_10px_2px_rgba(251,191,36,0.55)]",
        false: "",
      },
      /**
       * Persistent larger resting size. Deliberately a separate variant from
       * `justDiscarded`: DiscardPile drives both together for the most
       * recent discard, but ActionDock also reuses `justDiscarded`'s
       * ring/glow to highlight a claim's target tile among a cramped
       * candidate row, where a scale bump would fight the row's own tight
       * layout — see ActionDock.tsx's `isTarget`. `enlarged` and `clickable`
       * never coexist today (only DiscardPile passes `enlarged`, and it
       * never marks a discard `clickable`) — if a future caller combines
       * them, this scale composes with `clickable`'s `origin-bottom` as-is,
       * since neither sets its own conflicting transform-origin. The class
       * must stay a literal string (not built from a JS constant) — Tailwind
       * only picks up arbitrary-value utilities it can find verbatim in
       * source.
       */
      enlarged: { true: "scale-[1.4]", false: "" },
    },
    defaultVariants: {
      clickable: false,
      selected: false,
      justDiscarded: false,
      enlarged: false,
    },
  },
);

export interface TileFaceProps extends VariantProps<typeof tileVariants> {
  tileId?: number | undefined;
  /** Whether to render the back image — Tile.tsx already resolved this from `back`/`tileId`. */
  isBack: boolean;
  onClick?: (() => void) | undefined;
  dimmed?: boolean | undefined;
}

/**
 * The innermost layer of Tile.tsx's three-layer split: the actual face
 * (image, clickable/selected/justDiscarded/enlarged styling, click
 * handling). Fills whatever box TileMotion gave it. `dimmed` is a plain
 * inline `opacity` (not a CVA class or motion `animate` target) — nothing
 * here plays a one-shot transition on mount, so a runtime style is exactly
 * as smooth as a class would be, without needing motion at all.
 */
export function TileFace({
  tileId,
  isBack,
  clickable,
  selected,
  justDiscarded,
  enlarged,
  dimmed,
  onClick,
}: TileFaceProps) {
  const tileTheme = useTableLayoutStore((state) => state.tileTheme);
  const isClickable = Boolean(clickable);
  const src = isBack ? tileBackImageSrc(tileTheme) : tileImageSrc(tileId!, tileTheme);

  return (
    <div
      className={cn(
        tileVariants({ clickable: isClickable, selected, justDiscarded, enlarged }),
        tileTheme === "Black" && "border-neutral-700 bg-neutral-950",
      )}
      style={{ opacity: dimmed ? 0.4 : 1 }}
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
