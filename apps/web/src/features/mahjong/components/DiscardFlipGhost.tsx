import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Tile } from "./Tile";

interface DiscardFlipGhostProps {
  tileId: number;
  /** This tile's own rect, captured at the moment it was clicked in hand — see HandRow.tsx's onClick. */
  fromRect: DOMRect;
  /** Ref to the real discard-pile tile this ghost flies toward; also this flight's resting box. */
  toRef: RefObject<HTMLElement | null>;
}

const GHOST_TRANSITION = { duration: 0.3, ease: "easeOut" } as const;

/**
 * A self-contained, temporary clone that flies a just-discarded tile straight
 * from its hand position to the discard pile — same isolation principle (and
 * the same plain rect-to-rect FLIP math) as ClaimFlipGhost.tsx, just with a
 * different source: a discarded tile genuinely leaves the hand array (unlike
 * a claim's permanent tombstone), so by the time a later snapshot-driven
 * render mounts this ghost, the source element is already gone. `fromRect` is
 * measured eagerly at click time instead (see HandRow.tsx's captureTileRect)
 * and handed down as a plain geometry value — never game state, so this
 * never touches architecture iron rule 5 (no state update is ever driven by
 * this measurement or by the command ack).
 */
export function DiscardFlipGhost({ tileId, fromRect, toRef }: DiscardFlipGhostProps) {
  const [flight, setFlight] = useState<{ to: DOMRect } | null>(null);

  useLayoutEffect(() => {
    const toEl = toRef.current;
    if (toEl) {
      setFlight({ to: toEl.getBoundingClientRect() });
    }
    // Once only — see ClaimFlipGhost.tsx's identical note (mounted exactly
    // once per genuine discard; `fromRect` is a plain captured value, not a
    // live element, so there's nothing new to pick up even if this re-ran).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!flight) return null;
  const { to } = flight;
  const dx = fromRect.left - to.left;
  const dy = fromRect.top - to.top;
  const scaleX = fromRect.width / to.width;
  const scaleY = fromRect.height / to.height;

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
      onAnimationComplete={() => setFlight(null)}
    >
      <Tile tileId={tileId} heightPx="100%" />
    </motion.div>,
    document.body,
  );
}
