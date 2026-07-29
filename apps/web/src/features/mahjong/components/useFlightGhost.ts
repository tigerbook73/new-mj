import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Shared measure-once-then-self-clear plumbing behind DrawFlipGhost/
 * DiscardFlipGhost/ClaimFlipGhost: all three mount a temporary portal clone
 * that flies from a `from` rect to a `to` rect, measured exactly once in a
 * `useLayoutEffect` right after the real destination element has mounted (see
 * each ghost's own docs for why this must never re-measure on a later
 * render). Only the *geometry lookup* is shared here — `resolveFrom` lets
 * each caller keep its own way of finding the source (a fixed selector, an
 * already-captured click-time rect, a center-point comparison, ...), and the
 * actual motion/JSX (translate-only vs translate+scale, fade vs no fade)
 * stays in each ghost component, since those genuinely differ.
 */
export interface FlightRects {
  from: DOMRect;
  to: DOMRect;
}

export function useFlightGhost(
  resolveFrom: () => DOMRect | null | undefined,
  toRef: RefObject<HTMLElement | null>,
): [
  FlightRects | null,
  /** Call from `motion.div`'s `onAnimationComplete` to unmount the ghost. */ () => void,
] {
  const [flight, setFlight] = useState<FlightRects | null>(null);

  useLayoutEffect(() => {
    const from = resolveFrom();
    const toEl = toRef.current;
    if (from && toEl) {
      setFlight({ from, to: toEl.getBoundingClientRect() });
    }
    // Deliberately once-only (empty deps) — see the callers' own notes: each
    // ghost is mounted exactly once per genuine draw/discard/claim, and must
    // never re-measure mid-flight. (No eslint-disable needed here: this
    // project's react-hooks plugin only covers .tsx files — see
    // useIsIncrementalSnapshot.ts for the same convention.)
  }, []);

  return [flight, () => setFlight(null)];
}
