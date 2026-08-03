import { type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { tileBackImageSrc, tileImageSrc } from "@/features/mahjong/lib/mahjongTiles";
import { SEAT_ROTATION, type SeatDirection } from "@/features/mahjong/lib/seatLayout";
import { useTableLayoutStore } from "@/features/mahjong/tableLayout.store";
import { OPPONENT_DISCARD_FLIGHT_DURATION, TILE_MOTION_EASE } from "./tileMotionTiming";
import { useFlightGhost } from "./useFlightGhost";

interface OpponentDiscardFlipGhostProps {
  /** The now-public discarded TileId — a discard is public the instant it lands, so this is never a concealed-hand privacy concern once it's in the river. */
  tileId: number;
  /** The discarding seat's own on-screen direction — both the flight's origin zone and its starting rotation angle. */
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
  delay: OPPONENT_DISCARD_FLIGHT_DURATION / 2,
} as const;

/**
 * An opponent's discard flies from their *whole hand zone* — never a
 * specific tracked tile, since a concealed hand has no per-tile identity a
 * public event may reveal (see docs/architecture/frontend-layout.md §5) —
 * to the discard pile, rotating from their seat's own on-screen angle down
 * to upright while crossfading from a back image to the (now-public) real
 * face partway through. See useFlightGhost.ts for the shared isolation
 * principle.
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

  if (!flight) return null;
  const { from, to } = flight;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);

  return createPortal(
    <motion.div
      data-testid="opponent-discard-flip-ghost"
      style={{
        position: "fixed",
        left: to.left,
        top: to.top,
        width: to.width,
        height: to.height,
        pointerEvents: "none",
        zIndex: 50,
      }}
      // Keep viewport translation separate from seat rotation: composing
      // `x/y` and `rotate(±90deg)` on this same node rotates the translation
      // vector too, which makes a left/right discard visibly sidestep before
      // it heads toward the river.
      initial={{ x: dx, y: dy, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      transition={GHOST_TRANSITION}
      onAnimationComplete={() => {
        clear();
        onAnimationComplete?.();
      }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ rotate: SEAT_ROTATION[fromDirection] }}
        animate={{ rotate: 0 }}
        transition={GHOST_TRANSITION}
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
