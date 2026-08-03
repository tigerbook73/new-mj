import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, type Transition } from "motion/react";
import { Tile } from "@/features/mahjong/components/Tile";
import { useFlightGhost } from "./useFlightGhost";

export function TileFlightPortal({
  testId,
  tileId,
  resolveFrom,
  toRef,
  initial,
  transition,
  onComplete,
}: {
  testId: string;
  tileId?: number;
  resolveFrom: () => DOMRect | null | undefined;
  toRef: RefObject<HTMLElement | null>;
  initial: (from: DOMRect, to: DOMRect) => Record<string, number>;
  transition: Transition;
  onComplete?: (() => void) | undefined;
}) {
  const [flight, clear] = useFlightGhost(resolveFrom, toRef);
  if (!flight) return null;
  const { from, to } = flight;
  return createPortal(
    <motion.div
      data-testid={testId}
      style={{
        position: "fixed",
        left: to.left,
        top: to.top,
        width: to.width,
        height: to.height,
        pointerEvents: "none",
        zIndex: 50,
      }}
      initial={initial(from, to)}
      animate={{ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 }}
      transition={transition}
      onAnimationComplete={() => {
        clear();
        onComplete?.();
      }}
    >
      <Tile {...(tileId !== undefined ? { tileId } : {})} height="100%" />
    </motion.div>,
    document.body,
  );
}
