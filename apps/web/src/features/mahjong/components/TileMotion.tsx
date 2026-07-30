import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/shared/hooks/usePrefersReducedMotion";
import { resolveTileMotion } from "./resolveTileMotion";

export interface TileMotionProps {
  /** Plays the one-shot arrival animation on mount — see resolveTileMotion. */
  entering?: boolean | "opacityOnly" | undefined;
  /** Smoothly animates this node's own position/size when it changes as a side effect of siblings mounting/unmounting — motion's `layout` (unrelated to `layoutId`, see ClaimFlipGhost.tsx's docs for why that's a different, riskier tool). */
  reflow?: boolean | undefined;
  testId?: string | undefined;
  /** Whether this is a face-down tile — determines whether `data-tile-id` is set at all (a concealed tile's id must never appear in the DOM). */
  isBack: boolean;
  tileId?: number | undefined;
  children?: ReactNode;
}

/**
 * The animated shell of Tile.tsx's three-layer split — always `h-full
 * w-full`, filling whatever box TileSlot gave it. Carries `data-testid`/
 * `data-tile-id`/`data-entering` because this is the node motion actually
 * writes transforms to, satisfying e2e's expectation of "the same node."
 * Falls back to a plain `div` under `prefers-reduced-motion` — closing a gap
 * this component used to leave to its callers (see docs/architecture/
 * frontend-layout.md and TableView.tsx's own `usePrefersReducedMotion`
 * call): previously only the *callers* gated `entering` on it, so a caller
 * that forgot would still animate. Reused from shared/hooks, not
 * reimplemented.
 */
export function TileMotion({
  entering,
  reflow,
  testId,
  isBack,
  tileId,
  children,
}: TileMotionProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  // Captured once at mount: motion's own inline style converges to the same
  // final opacity/transform whether or not this instance played the entry
  // transition, so nothing about the settled DOM reveals it after the fact.
  // This is the only remaining deterministic signal for e2e coverage of "did
  // this tile enter animated."
  const [wasEntering] = useState(entering);
  const dataProps = {
    "data-testid": testId,
    "data-tile-id": isBack ? undefined : tileId,
    "data-entering": wasEntering || undefined,
  };

  if (prefersReducedMotion) {
    return (
      <div {...dataProps} className="h-full w-full">
        {children}
      </div>
    );
  }

  const { initial, animate, transition } = resolveTileMotion(entering);
  return (
    <motion.div
      {...dataProps}
      className="h-full w-full"
      {...(reflow ? { layout: true } : {})}
      initial={initial}
      animate={animate}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
