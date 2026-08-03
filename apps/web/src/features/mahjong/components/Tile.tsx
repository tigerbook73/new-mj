import { TileFace } from "./TileFace";
import { TileMotion } from "./TileMotion";
import { TileSlot } from "./TileSlot";

export interface TileProps {
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
   * discard tiles pass only `height`, as a CSS percentage — and the other
   * is derived by the browser via CSS `aspect-ratio` instead of the caller
   * having to compute it.
   */
  width?: number | string;
  height?: number | string;
  clickable?: boolean | undefined;
  selected?: boolean | undefined;
  /** See TileFace's `justDiscarded` variant for what this drives and why it's a separate prop from `enlarged`. */
  justDiscarded?: boolean | undefined;
  /** See TileFace's `caishen` variant — hangzhou's white-dragon wild tile. */
  caishen?: boolean | undefined;
  /** Plays the one-shot arrival animation on mount — see `resolveTileMotion` for what each value does. */
  entering?: boolean | "opacityOnly" | undefined;
  /** Fades toward 40% opacity — plain CSS on TileFace, see its own docs. */
  dimmed?: boolean | undefined;
  /** Persistent larger resting size — see TileFace's `enlarged` variant. */
  enlarged?: boolean | undefined;
  /** Lets a flight ghost measure TileFace's final visual rect, including scale. */
  flightTarget?: boolean | undefined;
  /**
   * Smoothly animates this tile's own position/size whenever it changes as a
   * side effect of siblings mounting/unmounting — motion's `layout` (a
   * boolean, unrelated to `layoutId`/shared-layout — see ClaimFlipGhost.tsx's
   * docs for why that's a different, riskier tool). Used by HandRow so
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
 * Three layers, composed here and nowhere else — TileSlot (constant sizing),
 * TileMotion (the animated shell, carries the e2e-visible data attributes),
 * TileFace (image + click styling, all plain CSS). Splitting these apart
 * means `dimmed`/`enlarged` can be ordinary CSS on TileFace instead of
 * fighting motion's inline styles for the win (see TileFace's own docs) —
 * this file's public API is otherwise unchanged from the single-node
 * version, so every existing call site needs no changes except HandRow.tsx's
 * DrawnSlotTile (see `entering`'s `"opacityOnly"` above).
 *
 * Always rendered upright, in local (unrotated) coordinates. Any per-seat
 * visual rotation comes from the ancestor Zone's own `rotationDeg` (applied
 * once by ZoneRenderer's `zoneStyle()`, see lib/layoutPreset.ts) to the whole
 * region at once, not per tile.
 */
export function Tile({
  tileId,
  back = false,
  width,
  height,
  clickable,
  selected,
  justDiscarded,
  caishen,
  dimmed,
  entering,
  enlarged,
  flightTarget,
  reflow,
  onClick,
  className,
  testId,
}: TileProps) {
  const isPlaceholder = tileId !== undefined && tileId < 0;
  if (isPlaceholder) {
    return (
      <TileSlot isPlaceholder width={width} height={height} className={className} testId={testId} />
    );
  }

  const isBack = back || tileId === undefined;
  const isClickable = (clickable ?? Boolean(onClick)) && !isBack;

  return (
    <TileSlot isPlaceholder={false} width={width} height={height} className={className}>
      <TileMotion
        entering={entering}
        reflow={reflow}
        testId={testId}
        isBack={isBack}
        tileId={tileId}
      >
        <TileFace
          tileId={tileId}
          isBack={isBack}
          clickable={isClickable}
          selected={selected}
          justDiscarded={justDiscarded}
          enlarged={enlarged}
          flightTarget={flightTarget}
          caishen={caishen}
          dimmed={dimmed}
          onClick={onClick}
        />
      </TileMotion>
    </TileSlot>
  );
}
