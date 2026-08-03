import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { tileBackImageSrc, tileImageSrc } from "@/features/mahjong/lib/mahjongTiles";
import { SEAT_ROTATION, type SeatDirection } from "@/features/mahjong/lib/seatLayout";
import { useTableLayoutStore } from "@/features/mahjong/tableLayout.store";
import {
  OPPONENT_DISCARD_FLIGHT_DURATION,
  OPPONENT_DISCARD_HOLD_DURATION,
  TILE_MOTION_EASE,
} from "@/features/mahjong/animation/components/tileMotionTiming";
import { useFlightGhost } from "@/features/mahjong/animation/components/useFlightGhost";

interface OpponentDiscardFlipGhostProps {
  /** The now-public discarded TileId — a discard is public the instant it lands, so this is never a concealed-hand privacy concern once it's in the river. */
  tileId: number;
  /** The discarding seat's own on-screen direction, used when no precise source rect is available. */
  fromDirection: SeatDirection;
  /** Exact cosmetic back-slot rect when the hand animation coordinator has one. */
  fromRect?: DOMRect | undefined;
  /** Ref to the real discard-pile tile this ghost flies toward; also this flight's resting box. */
  toRef: RefObject<HTMLElement | null>;
  onAnimationComplete?: (() => void) | undefined;
}

const GHOST_TRANSITION = {
  duration: OPPONENT_DISCARD_FLIGHT_DURATION,
  ease: TILE_MOTION_EASE,
} as const;
// The crossfade plays over the flight's back half, so the tile still visually
// reads as concealed for the first beat of travel, then reveals partway in.
const FLIP_TRANSITION = {
  duration: OPPONENT_DISCARD_FLIGHT_DURATION / 2,
  ease: TILE_MOTION_EASE,
  delay: OPPONENT_DISCARD_HOLD_DURATION + OPPONENT_DISCARD_FLIGHT_DURATION / 2,
} as const;

/**
 * An opponent's discard flies from their *whole hand zone* — never a
 * specific tracked tile, since a concealed hand has no per-tile identity a
 * public event may reveal (see docs/architecture/frontend-layout.md §5) —
 * to the discard pile while crossfading from a back image to the (now-public)
 * real face partway through. Its outer portal box stays in screen coordinates;
 * a nested surface reproduces the seat Zone's rotation with its pre-rotation
 * dimensions, so a left/right source keeps the same visible aspect ratio.
 *
 * Deliberately not a literal 3D flip (no `rotateY`/`backface-visibility`) —
 * this project has no such precedent, and every other ghost here stays
 * plain (no overshoot, no pop); a 2D crossfade reads as "revealing" without
 * introducing an effect unlike anything else on the table.
 */
export function OpponentDiscardFlipGhost({
  tileId,
  fromDirection,
  fromRect,
  toRef,
  onAnimationComplete,
}: OpponentDiscardFlipGhostProps) {
  const tileTheme = useTableLayoutStore((state) => state.tileTheme);
  const [flight, clear] = useFlightGhost(
    () =>
      fromRect ??
      document
        .querySelector(`[data-testid="player-track-${fromDirection}"]`)
        ?.getBoundingClientRect(),
    toRef,
  );
  const [departing, setDeparting] = useState(false);

  useEffect(() => {
    if (!flight) return;
    const timer = window.setTimeout(
      () => setDeparting(true),
      OPPONENT_DISCARD_HOLD_DURATION * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [flight]);

  if (!flight) return null;
  const { from, to } = flight;
  const rotation = SEAT_ROTATION[fromDirection];
  const isQuarterTurn = Math.abs(rotation) === 90;
  const sourceSurface = {
    width: isQuarterTurn ? from.height : from.width,
    height: isQuarterTurn ? from.width : from.height,
  };
  const targetSurface = {
    width: isQuarterTurn ? to.height : to.width,
    height: isQuarterTurn ? to.width : to.height,
  };
  const sourceBox = { left: from.left, top: from.top, width: from.width, height: from.height };
  return createPortal(
    <motion.div
      data-testid="opponent-discard-flip-ghost"
      style={{
        position: "fixed",
        pointerEvents: "none",
        zIndex: 50,
        overflow: "visible",
      }}
      // Animate the viewport box itself. `from` is the first painted box;
      // preserving it verbatim avoids any left/right coordinate conversion.
      initial={{ ...sourceBox, opacity: 1 }}
      animate={
        departing
          ? { left: to.left, top: to.top, width: to.width, height: to.height, opacity: 1 }
          : { ...sourceBox, opacity: 1 }
      }
      transition={
        departing
          ? {
              left: GHOST_TRANSITION,
              top: GHOST_TRANSITION,
              width: GHOST_TRANSITION,
              height: GHOST_TRANSITION,
            }
          : { duration: 0 }
      }
      onAnimationComplete={() => {
        if (!departing) return;
        clear();
        onAnimationComplete?.();
      }}
    >
      <motion.div
        className="absolute overflow-hidden"
        style={{ left: "50%", top: "50%" }}
        initial={{ ...sourceSurface, x: "-50%", y: "-50%", rotate: rotation }}
        animate={
          departing
            ? { ...targetSurface, x: "-50%", y: "-50%", rotate: rotation }
            : { ...sourceSurface, x: "-50%", y: "-50%", rotate: rotation }
        }
        transition={
          departing ? { width: GHOST_TRANSITION, height: GHOST_TRANSITION } : { duration: 0 }
        }
      >
        <motion.img
          src={tileBackImageSrc(tileTheme)}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-fill"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={FLIP_TRANSITION}
        />
        <motion.img
          src={tileImageSrc(tileId, tileTheme)}
          alt={String(tileId)}
          draggable={false}
          className="absolute inset-0 h-full w-full object-fill"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={FLIP_TRANSITION}
        />
      </motion.div>
    </motion.div>,
    document.body,
  );
}
