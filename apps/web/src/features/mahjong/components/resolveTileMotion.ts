import {
  TILE_ENTRY_DURATION,
  TILE_MOTION_EASE,
} from "@/features/mahjong/animation/components/tileMotionTiming";

const TILE_ENTER_TRANSITION = { duration: TILE_ENTRY_DURATION, ease: TILE_MOTION_EASE } as const;

export type TileMotionSpec = {
  initial: false | { opacity: number; scale: number; y: number };
  animate: { opacity: number; scale: number; y: number };
  transition: typeof TILE_ENTER_TRANSITION;
};

/**
 * Pure mapping from `entering` to the motion keyframes for TileMotion's own
 * layer — the rest state is always `{ opacity: 1, scale: 1, y: 0 }`
 * regardless of `dimmed`/`enlarged`, since those now live on TileFace as
 * plain CSS and compose visually on top of whatever this layer animates (a
 * persistent `scale-[1.4]` on the inner TileFace node, times this layer's
 * own 0.75→1 entrance, reads as "growing into its enlarged size" — same end
 * result as the old single-node version, just factored across two nodes).
 * `"opacityOnly"` skips the scale/rise keyframes, leaving only opacity — for
 * when a separate flying ghost already sells the arrival's physical motion
 * (see HandRow.tsx's DrawnSlotTile, the only caller that ever passes it).
 *
 * Kept in its own module (not alongside the TileMotion component itself) so
 * this stays importable as a plain function — co-locating it with the
 * component trips `react-refresh/only-export-components`.
 */
export function resolveTileMotion(entering: boolean | "opacityOnly" | undefined): TileMotionSpec {
  const animate = { opacity: 1, scale: 1, y: 0 };
  if (!entering) return { initial: false, animate, transition: TILE_ENTER_TRANSITION };
  if (entering === "opacityOnly") {
    return { initial: { opacity: 0, scale: 1, y: 0 }, animate, transition: TILE_ENTER_TRANSITION };
  }
  return {
    initial: { opacity: 0, scale: 0.75, y: 24 },
    animate,
    transition: TILE_ENTER_TRANSITION,
  };
}
