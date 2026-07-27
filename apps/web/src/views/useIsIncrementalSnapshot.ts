import { useState } from "react";

/**
 * True when `gameSeq` just advanced from the previous render of this
 * component tree — a live, in-place continuation of the same game. False on
 * the first snapshot after mount, a room/game reset (`gameSeq` passes
 * through `null`), or a reconnect that jumps straight to the current seq:
 * those cases must render their final state immediately, not replay entry
 * animations for events the viewer never actually watched happen
 * (session-mechanics.md § "评审点 I" — reconnect adopts the latest snapshot,
 * no animation replay).
 *
 * Uses React's documented "adjust state during render" idiom (two `useState`
 * atoms compared against the incoming prop, not a `useRef` mutated in the
 * render body) specifically because this project renders under
 * `<StrictMode>`: a ref written unconditionally on every render body gets
 * mutated twice per commit under StrictMode's dev-mode double-invoke, so the
 * second pass always reads back the value the first pass just wrote and the
 * comparison permanently collapses to "unchanged". `setState`-during-render
 * is deduplicated by React itself, so it stays correct under double-invoke.
 */
export function useIsIncrementalSnapshot(gameSeq: number | null): boolean {
  const [prevSeq, setPrevSeq] = useState<number | null>(gameSeq);
  const [isIncremental, setIsIncremental] = useState(false);

  if (gameSeq !== prevSeq) {
    setIsIncremental(prevSeq !== null && gameSeq !== null);
    setPrevSeq(gameSeq);
  }

  return isIncremental;
}
