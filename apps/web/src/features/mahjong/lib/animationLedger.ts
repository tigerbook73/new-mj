import type { PlayerViewBase, SeatId } from "@new-mj/protocol";
import { diffPlayerView, type SlotEvent } from "./diffPlayerView";

export type Resolution = "flight" | "appear" | "skip";

/**
 * Module-level singleton, not a zustand store: writes only ever come from
 * registerSnapshotDiff (socket-driven) and completeSlot (an animation's own
 * imperative finish), reads only happen once per mount inside
 * `useState(() => resolveSlot(key))` — nothing here is meant to trigger a
 * re-render, so zustand's subscription machinery would be pure overhead.
 */
const resolutions = new Map<string, Resolution>();
const drawLaneBusy = new Map<SeatId, string>();

function settle(key: string, seat?: SeatId): void {
  resolutions.delete(key);
  if (seat !== undefined && drawLaneBusy.get(seat) === key) {
    drawLaneBusy.delete(seat);
  }
}

function drawEventSeat(event: SlotEvent): SeatId {
  const suffix = event.key.startsWith("draw:own:")
    ? event.key.slice("draw:own:".length)
    : event.key.slice("draw:opp:".length);
  return Number(suffix) as SeatId;
}

/**
 * The single write entrypoint. Must run synchronously in TableView's
 * `game:snapshot` handler, before `applyGameSnapshot` swaps `view` — the
 * caller is responsible for the seq guard (strictly greater than the
 * current `gameSeq`, and only once `gameSeq !== null`) so a stale or
 * duplicate snapshot never reaches here. `gameNumber` (RoomInfo.gameNumber)
 * prefixes every key so a same-index slot from a prior game can never
 * collide with this game's, independent of whether `resetAnimationLedger`
 * happened to run first.
 */
export function registerSnapshotDiff(
  prev: PlayerViewBase | null,
  next: PlayerViewBase,
  mySeat: SeatId,
  gameNumber: number,
): void {
  const events = diffPlayerView(prev, next, mySeat);
  for (const event of events) {
    const key = `g${gameNumber}:${event.key}`;
    if (event.category === "draw") {
      const seat = drawEventSeat(event);
      const busyKey = drawLaneBusy.get(seat);
      if (busyKey !== undefined) {
        // The only structural-conflict downgrade (decision 3/4): the prior
        // draw slot is being unmounted by the key change that produced this
        // new draw event, so its lane must be settled right here — waiting
        // for that slot's own unmount cleanup would leave the lane occupied
        // for one extra registration and skip a draw that didn't need to be.
        settle(busyKey, seat);
        resolutions.set(key, "skip");
      } else {
        resolutions.set(key, "flight");
        drawLaneBusy.set(seat, key);
      }
    } else if (event.key.startsWith("discard:")) {
      // Every discard is flight-eligible now (stage 5): mine flies from its
      // click/timeout-captured hand rect (DiscardFlipGhost); an opponent's
      // flies from their whole hand zone (OpponentDiscardFlipGhost) — see
      // DiscardPile.tsx's DiscardTileSlot for which ghost actually mounts.
      resolutions.set(key, "flight");
    } else {
      resolutions.set(key, event.critical ? "flight" : "appear");
    }
  }
}

/**
 * Pure read, must stay idempotent — a consumer's lazy `useState` initializer
 * can run twice under StrictMode.
 */
export function resolveSlot(key: string): Resolution {
  return resolutions.get(key) ?? "skip";
}

/**
 * Recovers the seat a *fully-prefixed* draw key (e.g. `g3:draw:opp:1`)
 * occupies a lane for, so callers (useSlotEntering) can settle it without
 * having to separately thread a seat prop through every consuming
 * component. Discard/meld keys never match and yield `undefined` — harmless,
 * since `completeSlot`'s `seat` param is a no-op when omitted.
 */
export function laneSeatFromKey(key: string): SeatId | undefined {
  const match = /draw:(?:own|opp):(\d+)$/.exec(key);
  return match ? (Number(match[1]) as SeatId) : undefined;
}

/**
 * The seq guard TableView's `game:snapshot` handler must apply before
 * calling registerSnapshotDiff: strictly greater than the current `gameSeq`
 * (a same-seq resend must not re-diff and double-occupy a lane), and only
 * once `gameSeq !== null` (the first snapshot of a new epoch never diffs
 * against a stale, prior-game `view` — see docs/process/table-animation-
 * refactor.md's TableView.tsx sample).
 */
export function shouldRegisterSnapshotDiff(gameSeq: number | null, eventSeq: number): boolean {
  return gameSeq !== null && eventSeq > gameSeq;
}

/**
 * Must be idempotent: both a ghost's `onAnimationComplete` and the
 * consuming slot's unmount cleanup call this for the same key, and there's
 * no guarantee either fires exactly once. `seat` is only needed to release
 * a draw lane; omit it for discard/meld keys, which never occupy one.
 */
export function completeSlot(key: string, seat?: SeatId): void {
  settle(key, seat);
}

/** Called on a new game (dealer change) and on TableView mount, to drop any residue from a prior game or an earlier mount (e2e/StrictMode remounts). */
export function resetAnimationLedger(): void {
  resolutions.clear();
  drawLaneBusy.clear();
}
