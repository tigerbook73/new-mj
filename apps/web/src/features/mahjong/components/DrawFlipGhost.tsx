import { type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Tile } from "./Tile";
import { DRAW_FLIGHT_DURATION, TILE_MOTION_EASE } from "./tileMotionTiming";
import { useFlightGhost } from "./useFlightGhost";

interface DrawFlipGhostProps {
  /** Omit (face-down) for an opponent's draw — see HandRow.tsx's DrawnSlotTile. */
  tileId?: number | undefined;
  /** Ref to the real pinned drawn-tile slot this ghost flies toward; also this flight's resting box. */
  toRef: RefObject<HTMLElement | null>;
  /** Fires once the flight settles — see useSlotEntering/animationLedger's completeSlot, which frees this seat's draw lane. */
  onAnimationComplete?: (() => void) | undefined;
}

const GHOST_TRANSITION = { duration: DRAW_FLIGHT_DURATION, ease: TILE_MOTION_EASE } as const;

/**
 * Flies a freshly-drawn tile in from the table's center — see
 * useFlightGhost.ts for the isolation principle every ghost here shares.
 * Unlike the claim flight, the "from" side here is never a real per-tile
 * element (tiles in the wall have no individual visual representation at
 * all), so this flies from `CenterStatus`'s on-screen center point rather
 * than a specific tile's rect — hence aligning by center point below instead
 * of useFlightGhost's other callers' top-left corner. Stays at its normal
 * size throughout — no scale animation at all — per user testing feedback;
 * earlier versions tried both an overshoot past normal size mid-flight and a
 * plain "grow from smaller", and both read as an unwanted "pop"/resize
 * rather than a deliberate beat.
 */
export function DrawFlipGhost({ tileId, toRef, onAnimationComplete }: DrawFlipGhostProps) {
  const [flight, clear] = useFlightGhost(
    () => document.querySelector('[data-testid="table-center-status"]')?.getBoundingClientRect(),
    toRef,
  );

  if (!flight) return null;
  const { from, to } = flight;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);

  return createPortal(
    <motion.div
      data-testid="draw-flip-ghost"
      style={{
        position: "fixed",
        left: to.left,
        top: to.top,
        width: to.width,
        height: to.height,
        pointerEvents: "none",
        zIndex: 50,
      }}
      initial={{ x: dx, y: dy, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      transition={GHOST_TRANSITION}
      onAnimationComplete={() => {
        clear();
        onAnimationComplete?.();
      }}
    >
      <Tile {...(tileId !== undefined ? { tileId } : {})} height="100%" />
    </motion.div>,
    document.body,
  );
}
