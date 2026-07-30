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
 * Reads animationLedger's resolution for `key` exactly once, at mount, and
 * never again — safe because the ledger's write side always runs before the
 * render that mounts this hook (see animationLedger.ts's registerSnapshotDiff
 * doc). The unmount cleanup calls completeSlot defensively (idempotent — see
 * animationLedger.ts) to cover a slot that unmounts before its ghost, if
 * any, ever got to call back.
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
