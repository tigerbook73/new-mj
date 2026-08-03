import { type RefObject } from "react";
import { TileFlightPortal } from "@/features/mahjong/animation/components/TileFlightPortal";
import { DISCARD_FLIGHT_DURATION, TILE_MOTION_EASE } from "@/features/mahjong/animation/components/tileMotionTiming";

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
  return <TileFlightPortal testId="discard-flip-ghost" tileId={tileId} resolveFrom={() => fromRect} toRef={toRef} initial={(from, to) => ({ x: from.left - to.left, y: from.top - to.top, scaleX: from.width / to.width, scaleY: from.height / to.height })} transition={GHOST_TRANSITION} onComplete={onAnimationComplete} />;
}
