import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { tileBackImageSrc, tileImageSrc } from "@/lib/mahjongTiles";
import { useTableLayoutStore } from "@/store/tableLayout";

const tileVariants = cva(
  "relative inline-block shrink-0 select-none overflow-hidden rounded-[15%] border border-border bg-[#e8d4b0] shadow-md",
  {
    variants: {
      clickable: {
        // The scale part of the old hover enlargement moved to motion's
        // `whileHover` (see call site) — motion writes `transform` as a
        // permanent inline style once mounted (it owns `y`/`scale` for the
        // entry animation, see TILE_HOVER_SCALE/TILE_ENTER_INITIAL below),
        // which silently wins over any CSS `hover:scale-*` utility class
        // since inline styles always beat stylesheet rules. Non-transform
        // hover feedback (border/ring/shadow) has no such conflict and stays
        // plain CSS.
        true: "origin-bottom cursor-pointer transition-[border-color,box-shadow] hover:z-10 hover:border-cyan-400 hover:ring-2 hover:ring-cyan-300 hover:shadow-lg",
        false: "",
      },
      // NOTE: if this ever gets wired up (currently unused — no caller
      // passes `selected`), `-translate-y-2` has the exact same
      // inline-style-vs-CSS-class conflict as the old hover scale did: fold
      // it into TILE_ENTER_ANIMATE's `y` target instead of a CSS class.
      selected: { true: "ring-2 ring-primary", false: "" },
      /** The single most recent discard on the table (view.lastDiscard) — see DiscardPile. */
      justDiscarded: {
        true: "ring-2 ring-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,0.55)]",
        false: "",
      },
    },
    defaultVariants: {
      clickable: false,
      selected: false,
      justDiscarded: false,
    },
  },
);

/**
 * One-shot arrival animation for a tile that just entered the table (e.g. a
 * fresh discard) — driven by motion's `initial`/`animate` instead of a CSS
 * class (Phase 5a originally used tw-animate-css; switched to motion so
 * later phases — a round-end overlay fading out — get exit animations for
 * free instead of hand-rolled delayed-unmount. The claimed-discard-to-meld
 * flight (Phase 5c follow-up) does NOT use motion's `layoutId` shared-layout
 * system, despite that looking like the obvious fit: sharing a `layoutId`
 * between the permanent discard tombstone and the new meld tile made motion
 * treat the tombstone as if it were exiting (auto-fading it to opacity 0 +
 * `pointer-events:none`) the instant the meld tile claimed the id — an
 * undocumented side effect of the AnimatePresence-style crossfade the
 * shared-layout system assumes, which fought the tombstone's own `dimmed`
 * target and couldn't be turned off via `layout="position"`. See
 * ClaimFlipGhost.tsx for the actual implementation: a separate, self-
 * contained clone element does the flying, so the tombstone and the real
 * meld tile never have their own animation state touched by it at all.
 *
 * `initial={false}` (see call site) makes non-entering tiles render directly
 * at this same end state with no transition at all, matching the old
 * `entering: false` CSS variant's empty string.
 *
 * `opacity` is computed per-render from `dimmed` (see call site) rather than
 * fixed at 1 here — motion writes whatever `animate` resolves to as a
 * permanent inline style, which always wins over a CSS class (that's also
 * why the old `hover:scale-*` utility got dropped in favor of `whileHover`
 * below: an inline `transform` beats any stylesheet rule, hover pseudo-class
 * included). A `dimmed` CVA class here would only ever apply for one instant
 * before motion's own opacity overwrote it right back to 1.
 */
const TILE_ENTER_INITIAL = { opacity: 0, scale: 0.75, y: 24 };
const TILE_ENTER_TRANSITION = { duration: 0.3, ease: "easeOut" } as const;
const TILE_HOVER_SCALE = { scale: 1.2 };

/** Height / width of a real mahjong tile face — mirrors layouts/desktop.table-config.ts's `shared.aspectRatio`. */
const DEFAULT_TILE_ASPECT_RATIO = 1.333;

export interface TileProps extends VariantProps<typeof tileVariants> {
  /**
   * Omit (or set `back`) to render a face-down tile. Any negative value is a
   * layout-only placeholder — real TileIds are never negative (see
   * @new-mj/protocol) — and renders nothing at all (still occupies its box),
   * so callers can pad a row to a fixed slot count without a dedicated
   * sentinel constant.
   */
  tileId?: number;
  back?: boolean;
  /**
   * Pixel (or CSS percentage) box for this tile. Give both for an exact box
   * (what MeldGroup's measured pixel sizing does); give only one — hand and
   * discard tiles pass only `heightPx`, as a CSS percentage — and the other
   * is derived by the browser via CSS `aspect-ratio` instead of the caller
   * having to compute it.
   */
  widthPx?: number | string;
  heightPx?: number | string;
  /** Plays the one-shot arrival animation on mount — see TILE_ENTER_* above. */
  entering?: boolean | undefined;
  /** Fades toward 40% opacity via motion's `animate` — see TILE_ENTER_* above for why this isn't a CSS class. */
  dimmed?: boolean | undefined;
  /**
   * Smoothly animates this tile's own position/size whenever it changes as a
   * side effect of siblings mounting/unmounting — motion's `layout` (a
   * boolean, unrelated to `layoutId`/shared-layout — see the ClaimFlipGhost
   * docs above for why that's a different, riskier tool). Used by HandRow so
   * discarding a tile (unmounting it — see HandRow's tileId-keyed rest-of-
   * hand slots) makes the remaining tiles glide into their closed-up
   * positions instead of snapping. Not used elsewhere; leave off by default
   * so DiscardPile/MeldGroup's own layouts are untouched by this.
   */
  reflow?: boolean | undefined;
  onClick?: (() => void) | undefined;
  className?: string;
  testId?: string;
}

/**
 * Always rendered upright, in local (unrotated) coordinates. Any per-seat
 * visual rotation comes from the ancestor Zone's own `rotationDeg` (applied
 * once by ZoneRenderer's `zoneStyle()`, see lib/layoutPreset.ts) to the whole
 * region at once, not per tile.
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
  entering,
  reflow,
  onClick,
  className,
  testId,
}: TileProps) {
  const tileTheme = useTableLayoutStore((state) => state.tileTheme);
  // Captured once at mount: motion's own inline style converges to the same
  // final opacity/transform whether or not this instance played the entry
  // transition, so nothing about the settled DOM reveals it after the fact
  // (unlike the old CSS-class approach). This is the only remaining
  // deterministic signal for e2e coverage of "did this tile enter animated."
  const [wasEntering] = useState(entering);
  const isPlaceholder = tileId !== undefined && tileId < 0;
  if (isPlaceholder) {
    const hasWidth = widthPx !== undefined;
    const hasHeight = heightPx !== undefined;
    return (
      <div
        data-testid={testId}
        data-empty
        aria-hidden="true"
        className={cn("shrink-0", className)}
        style={{
          width: widthPx,
          height: heightPx,
          aspectRatio: hasWidth === hasHeight ? undefined : `1 / ${DEFAULT_TILE_ASPECT_RATIO}`,
        }}
      />
    );
  }
  const isBack = back || tileId === undefined;
  const isClickable = (clickable ?? Boolean(onClick)) && !isBack;
  const src = isBack ? tileBackImageSrc(tileTheme) : tileImageSrc(tileId!, tileTheme);
  const hasWidth = widthPx !== undefined;
  const hasHeight = heightPx !== undefined;

  return (
    <motion.div
      data-testid={testId}
      data-tile-id={isBack ? undefined : tileId}
      className={cn(
        tileVariants({ clickable: isClickable, selected, justDiscarded }),
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
      data-entering={wasEntering || undefined}
      {...(reflow ? { layout: true } : {})}
      initial={entering ? TILE_ENTER_INITIAL : false}
      animate={{ opacity: dimmed ? 0.4 : 1, scale: 1, y: 0 }}
      transition={TILE_ENTER_TRANSITION}
      {...(isClickable ? { whileHover: TILE_HOVER_SCALE } : {})}
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
    </motion.div>
  );
}
