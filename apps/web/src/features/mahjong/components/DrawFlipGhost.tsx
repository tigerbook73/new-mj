import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Tile } from "./Tile";

interface DrawFlipGhostProps {
  /** Omit (face-down) for an opponent's draw — see HandRow.tsx's DrawnSlotTile. */
  tileId?: number | undefined;
  /** Ref to the real pinned drawn-tile slot this ghost flies toward; also this flight's resting box. */
  toRef: RefObject<HTMLElement | null>;
}

const GHOST_TRANSITION = { duration: 0.35, ease: "easeOut" } as const;

/**
 * A self-contained, temporary clone that flies a freshly-drawn tile in from
 * the table's center — same isolation principle as ClaimFlipGhost.tsx
 * (measures once, portals a clone, self-removes; never touches the real
 * pinned-slot tile's own animation state). Unlike the claim flight, the
 * "from" side here is never a real per-tile element (tiles in the wall have
 * no individual visual representation at all — see docs/architecture), so
 * this flies from `CenterStatus`'s on-screen center point rather than a
 * specific tile's rect. Stays at its normal size throughout — no scale
 * animation at all — per user testing feedback; earlier versions tried both
 * an overshoot past normal size mid-flight and a plain "grow from smaller",
 * and both read as an unwanted "pop"/resize rather than a deliberate beat.
 */
export function DrawFlipGhost({ tileId, toRef }: DrawFlipGhostProps) {
  const [flight, setFlight] = useState<{ dx: number; dy: number; to: DOMRect } | null>(null);

  useLayoutEffect(() => {
    const centerEl = document.querySelector('[data-testid="table-center-status"]');
    const toEl = toRef.current;
    if (centerEl && toEl) {
      const from = centerEl.getBoundingClientRect();
      const to = toEl.getBoundingClientRect();
      const fromCenterX = from.left + from.width / 2;
      const fromCenterY = from.top + from.height / 2;
      const toCenterX = to.left + to.width / 2;
      const toCenterY = to.top + to.height / 2;
      setFlight({ dx: fromCenterX - toCenterX, dy: fromCenterY - toCenterY, to });
    }
    // Once only — see ClaimFlipGhost.tsx's identical note (this component
    // is mounted exactly once per genuine draw, never re-measured).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!flight) return null;
  const { dx, dy, to } = flight;

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
      onAnimationComplete={() => setFlight(null)}
    >
      <Tile {...(tileId !== undefined ? { tileId } : {})} heightPx="100%" />
    </motion.div>,
    document.body,
  );
}
