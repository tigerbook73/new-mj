import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Tile } from "./Tile";

interface ClaimFlipGhostProps {
  tileId: number;
  /** CSS selector for the discard-side source element — see MeldGroup.tsx for how it's built. */
  fromSelector: string;
  /** Ref to the real meld tile this ghost flies toward; also this flight's resting box. */
  toRef: RefObject<HTMLElement | null>;
}

const GHOST_TRANSITION = { duration: 0.3, ease: "easeOut" } as const;

/**
 * A self-contained, temporary clone that performs the claimed-discard-to-
 * meld flight independently of the real discard tombstone and the real meld
 * tile — see Tile.tsx's docs for why motion's `layoutId` shared-layout
 * system isn't used for this despite looking like the obvious fit (sharing a
 * `layoutId` between the permanent tombstone and the new meld tile made
 * motion treat the tombstone as exiting, fighting its own `dimmed` target).
 *
 * Measures both rects exactly once, in a `useLayoutEffect` that fires right
 * after this render's DOM has settled — the real meld tile has already
 * mounted by then, in the same commit, since both come from the same
 * snapshot-driven render. Renders a `position: fixed` portal clone animating
 * from the discard rect to the meld rect, then permanently stops rendering
 * anything once the transition completes (`onAnimationComplete`). Neither
 * the tombstone's nor the real meld tile's own animation state is ever
 * touched by any of this.
 */
export function ClaimFlipGhost({ tileId, fromSelector, toRef }: ClaimFlipGhostProps) {
  const [flight, setFlight] = useState<{ from: DOMRect; to: DOMRect } | null>(null);

  useLayoutEffect(() => {
    const fromEl = document.querySelector(fromSelector);
    const toEl = toRef.current;
    if (fromEl && toEl) {
      setFlight({ from: fromEl.getBoundingClientRect(), to: toEl.getBoundingClientRect() });
    }
    // Deliberately once-only (empty deps): this component is mounted exactly
    // once per genuine claim (see MeldGroup.tsx's `shouldGhost`, captured at
    // mount) and must never re-measure on a later re-render — the discard
    // tile never moves, but re-measuring mid-flight could pick up a stale
    // "to" rect and restart the animation from the wrong place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      onAnimationComplete={() => setFlight(null)}
    >
      <Tile tileId={tileId} heightPx="100%" />
    </motion.div>,
    document.body,
  );
}
