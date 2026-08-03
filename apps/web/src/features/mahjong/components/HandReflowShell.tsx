import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import { screenDeltaToLocal } from "@/features/mahjong/lib/screenReflow";
import { usePrefersReducedMotion } from "@/shared/hooks/usePrefersReducedMotion";
import { HAND_REFLOW_DURATION } from "./tileMotionTiming";

// Motion accepts its convenient `easeOut` alias; the Web Animations API
// requires a CSS easing value instead.
const REFLOW_EASING = "cubic-bezier(0, 0, 0.58, 1)";

/**
 * A small, transform-isolated FLIP shell for a hand token. Browser rects are
 * screen-space, while a rotated seat zone needs its inverse local vector.
 * TileMotion remains free to own its entry transform inside this shell.
 */
export function HandReflowShell({
  direction,
  token,
  enabled,
  children,
}: {
  direction: SeatDirection;
  token: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const previous = useRef<DOMRect | null>(null);
  const animation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    animation.current?.cancel();
    const next = element.getBoundingClientRect();
    const prior = previous.current;
    previous.current = next;
    if (
      !enabled ||
      prefersReducedMotion ||
      !prior ||
      (prior.left === next.left && prior.top === next.top)
    )
      return;
    const [x, y] = screenDeltaToLocal(direction, prior.left - next.left, prior.top - next.top);
    animation.current = element.animate(
      [{ transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" }],
      { duration: HAND_REFLOW_DURATION * 1000, easing: REFLOW_EASING, fill: "both" },
    );
    animation.current.onfinish = () => animation.current?.cancel();
    return () => animation.current?.cancel();
  });

  return (
    <div ref={ref} data-hand-token={token} className="flex h-full shrink-0 items-center">
      {children}
    </div>
  );
}
