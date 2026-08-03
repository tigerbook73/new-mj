import type { PlayerViewBase, SeatId } from "@new-mj/protocol";
import { registerSnapshotDiff, resetAnimationLedger, shouldRegisterSnapshotDiff } from "./animationLedger";
import { soleDiscardedTile } from "@/features/mahjong/lib/diffPlayerView";
import {
  handVisualAnimationState,
  registerHandVisualSnapshot,
  resetHandVisualLedger,
} from "./handVisualLedger";
import type { HandVisualTrack } from "./model/handVisualTrack";

export type TableAnimationMetadata = {
  handTracks: ReadonlyMap<SeatId, HandVisualTrack>;
  discardOrigins: ReadonlyMap<string, { rect: DOMRect; concealed: boolean }>;
};

export function resetTableAnimationRuntime(): void {
  resetAnimationLedger();
  resetHandVisualLedger();
}

export function registerTableSnapshotAnimation({
  previousSeq,
  nextSeq,
  previousView,
  nextView,
  seat,
  gameNumber,
  enabled,
  previousGodHands,
  nextGodHands,
}: {
  previousSeq: number | null;
  nextSeq: number;
  previousView: PlayerViewBase | null;
  nextView: PlayerViewBase;
  seat: SeatId;
  gameNumber: number;
  enabled: boolean;
  previousGodHands?: readonly (readonly number[])[] | undefined;
  nextGodHands?: readonly (readonly number[])[] | undefined;
}): { autoDiscardOrigin?: { tile: number; rect: DOMRect } } {
  const first = previousSeq === null;
  const incremental = shouldRegisterSnapshotDiff(previousSeq, nextSeq);
  if (!enabled || (!first && !incremental)) return {};
  if (incremental) registerSnapshotDiff(previousView, nextView, seat, gameNumber);
  registerHandVisualSnapshot(first ? null : previousView, nextView, seat, gameNumber, previousGodHands, nextGodHands);
  if (!incremental || !previousView || typeof document === "undefined") return {};
  const tile = soleDiscardedTile(previousView, nextView);
  const rect = tile === undefined ? undefined : document.querySelector(`[data-tile-id="${tile}"]`)?.getBoundingClientRect();
  return tile !== undefined && rect ? { autoDiscardOrigin: { tile, rect } } : {};
}

export function tableAnimationMetadata(): TableAnimationMetadata {
  const { tracks, discardOrigins } = handVisualAnimationState();
  return { handTracks: tracks, discardOrigins };
}
