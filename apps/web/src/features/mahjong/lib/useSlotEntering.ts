import { useEffect, useState } from "react";
import { completeSlot, laneSeatFromKey, resolveSlot } from "./animationLedger";

export type SlotEntering = {
  /** Passed straight through as Tile's `entering` prop. */
  entering: boolean;
  /** Whether this slot should also mount its companion `*FlipGhost`. */
  ghost: boolean;
  /** Pass to the mounted ghost's `onAnimationComplete` — see the ghost components. */
  onGhostComplete: () => void;
};

/**
 * Reads animationLedger's resolution for `key` exactly once, at mount — the
 * ledger's write side (registerSnapshotDiff) always runs synchronously in
 * TableView's socket handler, before the render that mounts this hook, so
 * the value read here is final for this slot's one-shot lifetime; nothing
 * here ever reads the ledger again afterward. The unmount cleanup calls
 * completeSlot defensively (idempotent — see animationLedger.ts) to cover a
 * slot that unmounts before its ghost, if any, ever got to call back.
 */
export function useSlotEntering(key: string): SlotEntering {
  const [resolution] = useState(() => resolveSlot(key));

  useEffect(() => {
    return () => completeSlot(key, laneSeatFromKey(key));
  }, [key]);

  return {
    entering: resolution !== "skip",
    ghost: resolution === "flight",
    onGhostComplete: () => completeSlot(key, laneSeatFromKey(key)),
  };
}
