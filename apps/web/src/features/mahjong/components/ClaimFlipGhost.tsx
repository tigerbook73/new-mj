import { type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Tile } from "./Tile";
import { CLAIM_FLIGHT_DURATION, TILE_MOTION_EASE } from "./tileMotionTiming";
import { useFlightGhost } from "./useFlightGhost";

interface ClaimFlipGhostProps {
  tileId: number;
  /** CSS selector for the discard-side source element — see MeldGroup.tsx for how it's built. */
  fromSelector: string;
  /** Ref to the real meld tile this ghost flies toward; also this flight's resting box. */
  toRef: RefObject<HTMLElement | null>;
  /** Fires once the flight settles — see useSlotEntering/animationLedger's completeSlot. */
  onAnimationComplete?: (() => void) | undefined;
}

const GHOST_TRANSITION = { duration: CLAIM_FLIGHT_DURATION, ease: TILE_MOTION_EASE } as const;

/**
 * Performs the claimed-discard-to-meld flight — see useFlightGhost.ts for
 * the shared isolation principle. This is why motion's `layoutId`
 * shared-layout system isn't used here despite looking like the obvious
 * fit: an earlier version shared a `layoutId` between the permanent discard
 * tombstone and the new meld tile, and motion treated the tombstone as
 * exiting the instant the meld tile claimed the id, fighting its own
 * `dimmed` target with an undocumented crossfade neither `layout="position"`
 * nor anything else could turn off. Both rects are measured exactly once
 * right after this render's DOM has settled — the real meld tile has
 * already mounted by then, in the same commit, since both come from the
 * same snapshot-driven render.
 */
export function ClaimFlipGhost({
  tileId,
  fromSelector,
  toRef,
  onAnimationComplete,
}: ClaimFlipGhostProps) {
  const [flight, clear] = useFlightGhost(
    () => document.querySelector(fromSelector)?.getBoundingClientRect(),
    toRef,
  );

  if (!flight) return null;
  const { from, to } = flight;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;

  return createPortal(
    <motion.div
      data-testid="claim-flip-ghost"
      style={{
        position: "fixed",
        left: to.left,
        top: to.top,
        width: to.width,
        height: to.height,
        pointerEvents: "none",
        zIndex: 50,
      }}
      initial={{ x: dx, y: dy, scaleX, scaleY }}
      animate={{ x: 0, y: 0, scaleX: 1, scaleY: 1 }}
      transition={GHOST_TRANSITION}
      onAnimationComplete={() => {
        clear();
        onAnimationComplete?.();
      }}
    >
      <Tile tileId={tileId} height="100%" />
    </motion.div>,
    document.body,
  );
}
