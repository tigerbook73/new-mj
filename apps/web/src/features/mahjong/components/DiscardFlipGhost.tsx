import { type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Tile } from "./Tile";
import { DISCARD_FLIGHT_DURATION, TILE_MOTION_EASE } from "@/features/mahjong/animation/components/tileMotionTiming";
import { useFlightGhost } from "@/features/mahjong/animation/components/useFlightGhost";

interface DiscardFlipGhostProps {
  tileId: number;
  /** This tile's own rect, captured at the moment it was clicked in hand — see HandRow.tsx's onClick. */
  fromRect: DOMRect;
  /** Ref to the real discard-pile tile this ghost flies toward; also this flight's resting box. */
  toRef: RefObject<HTMLElement | null>;
  /** Fires once the flight settles — see useSlotEntering/animationLedger's completeSlot. */
  onAnimationComplete?: (() => void) | undefined;
}

const GHOST_TRANSITION = { duration: DISCARD_FLIGHT_DURATION, ease: TILE_MOTION_EASE } as const;

/**
 * Flies a just-discarded tile straight from its hand position to the
 * discard pile — see useFlightGhost.ts for the shared isolation principle
 * and FLIP math. Different source than ClaimFlipGhost's: a discarded tile
 * genuinely leaves the hand array (unlike a claim's permanent tombstone), so
 * by the time a later snapshot-driven render mounts this ghost, the source
 * element is already gone. `fromRect` is measured eagerly at click time
 * instead (see HandRow.tsx's captureTileRect) and handed down as a plain
 * geometry value — never game state, no state update is ever driven by this
 * measurement or by the command ack.
 */
export function DiscardFlipGhost({
  tileId,
  fromRect,
  toRef,
  onAnimationComplete,
}: DiscardFlipGhostProps) {
  const [flight, clear] = useFlightGhost(() => fromRect, toRef);

  if (!flight) return null;
  const { from, to } = flight;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;

  return createPortal(
    <motion.div
      data-testid="discard-flip-ghost"
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
