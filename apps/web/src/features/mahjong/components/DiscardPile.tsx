import { useRef, useState } from "react";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import { useSlotEntering } from "@/features/mahjong/lib/useSlotEntering";
import type { TableLayoutConfig } from "@/features/mahjong/lib/tableLayoutConfig";
import { DiscardFlipGhost } from "./DiscardFlipGhost";
import { OpponentDiscardFlipGhost } from "./OpponentDiscardFlipGhost";
import { Tile } from "./Tile";
import { TileClaimSlot } from "./TileClaimSlot";

export type DiscardEntry = {
  tile: number;
  claimedBy?: number;
  /** Direction (relative to the viewer) of the seat that claimed this discard — see TableView. */
  claimedByDirection?: SeatDirection;
  /** True for the single most recent discard on the table (view.lastDiscard). */
  justDiscarded?: boolean;
  /** animationLedger key for this exact entry — see useSlotEntering, and useTablePresentation.ts's discardLedgerKey. */
  discardLedgerKey: string;
  /**
   * This tile's own hand-side rect, captured at click time (see HandRow.tsx's
   * `captureTileRect`) — only ever present for my own discards, and only for
   * the single render where this entry is genuinely new. Drives
   * DiscardFlipGhost below; absent (a page reload, or — deliberately — an
   * opponent's discard) just means this entry gets the plain grow-in entry
   * animation with no flight.
   *
   * Opponents' concealed tiles have no on-screen position to fly from in the
   * first place (architecture iron rule 2: public events can't reveal which
   * concealed tile it was), so any flight there could only ever be a rough
   * approximation. An earlier attempt tried exactly that — pick a
   * pseudo-random visible hand-back tile as the flight's origin, then reflow
   * the rest of the row to close the gap — and it added real complexity
   * (DOM position tracking, a second reflow-duration knob, a regression in
   * the "claim shrinks a hand" no-slide guarantee) for a visual that still
   * didn't read well in practice. Reverted 2026-07-29; not worth reattempting
   * without a materially simpler mechanism.
   */
  flightOrigin?: DOMRect;
};

interface DiscardPileProps {
  /** This pile's own seat direction — TileClaimSlot's badge counter-rotates against the ambient Zone rotation for this direction so it always reads in true screen orientation, the same technique InfoSlot uses for its label. */
  direction: SeatDirection;
  discards: DiscardEntry[];
  metrics: TableLayoutConfig;
}

/**
 * claimedBy'd entries stay in the pile (tombstone — see DiscardEntry docs), just dimmed.
 *
 * Two-level flex, not a measured grid: rows stack top-to-bottom (growing downward once
 * discards exceed the configured row count — never shrinking tiles to force a fit), each row
 * itself lays out left-to-right and centers its own content. The last row is padded with
 * invalid (negative) TileIds up to `columns` so its tiles stay column-aligned with the rows
 * above instead of collapsing toward one side — Tile.tsx renders those as invisible
 * placeholders that still occupy a slot. Row height is a fixed percentage of the pile's own
 * container height; each tile fills 100% of its row's height and derives its own width from
 * the aspect ratio, so none of this needs a measured container size.
 */
export function DiscardPile({ direction, discards, metrics }: DiscardPileProps) {
  const { columns, rows } = metrics.discardZone;
  const totalRows = Math.max(rows, Math.ceil(discards.length / columns));

  return (
    <div
      className="flex h-full w-full min-h-0 min-w-0 flex-col pt-2"
      style={{ gap: `${metrics.shared.tileGapPx}px` }}
    >
      {Array.from({ length: totalRows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex w-full min-w-0 items-center justify-center"
          style={{
            height: `${metrics.discardZone.discardShort}%`,
            gap: `${metrics.shared.tileGapPx}px`,
          }}
        >
          {Array.from({ length: columns }, (_, columnIndex) => {
            const entry = discards[rowIndex * columns + columnIndex];
            if (!entry) {
              return (
                <Tile key={columnIndex} testId="discard-slot-empty" tileId={-1} height="100%" />
              );
            }
            return (
              <DiscardTileSlot
                key={columnIndex}
                direction={direction}
                entry={entry}
                aspectRatio={metrics.shared.aspectRatio}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Owns the per-entry hook state a plain `.map()` callback can't (rules of
 * hooks) — specifically, whether to mount a `DiscardFlipGhost` alongside this
 * slot's real tile. `useSlotEntering` reads animationLedger's resolution for
 * `entry.discardLedgerKey` exactly once at mount. `ghostOrigin` is then
 * captured once more via `useState` (not read live from `entry.flightOrigin`
 * on every render), same reasoning as MeldGroup.tsx's `MeldClaimTile`:
 * TableView clears its own pending-origin state once the next snapshot
 * arrives (see TableView.tsx), which would flip `entry.flightOrigin` back to
 * `undefined` on the very next render — reading it live here would yank the
 * ghost off mid-flight for a reason that has nothing to do with the flight
 * itself actually finishing.
 */
function DiscardTileSlot({
  direction,
  entry,
  aspectRatio,
}: {
  direction: SeatDirection;
  entry: DiscardEntry;
  aspectRatio: number;
}) {
  const { entering, ghost, onGhostComplete } = useSlotEntering(entry.discardLedgerKey);
  const [ghostOrigin] = useState<DOMRect | null>(() =>
    ghost && entry.flightOrigin ? entry.flightOrigin : null,
  );
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={toRef} className="h-full">
        <TileClaimSlot
          direction={direction}
          claimFromDirection={entry.claimedByDirection}
          aspectRatio={aspectRatio}
          claimTestId="discard-claim-icon"
          tileId={entry.tile}
          dimmed={entry.claimedBy !== undefined}
          justDiscarded={entry.justDiscarded}
          // `justDiscarded` alone (view.lastDiscard) stays true until the
          // *next* discard event — it never updates on a claim — so once
          // this tile is claimed, shrink it back immediately instead of
          // waiting for someone else's next discard to supersede it. Same
          // condition `dimmed` above already reacts to on the very same
          // render, so the shrink and the dim-to-tombstone land together.
          enlarged={entry.justDiscarded && entry.claimedBy === undefined}
          entering={entering}
        />
      </div>
      {ghostOrigin && (
        <DiscardFlipGhost
          tileId={entry.tile}
          fromRect={ghostOrigin}
          toRef={toRef}
          onAnimationComplete={onGhostComplete}
        />
      )}
      {/* Stage 5 (exploratory): an opponent's discard has no click/timeout-
          captured rect to fly from (only my own does), so it flies from
          their whole hand zone instead — see OpponentDiscardFlipGhost. */}
      {ghost && direction !== "bottom" && !ghostOrigin && (
        <OpponentDiscardFlipGhost
          tileId={entry.tile}
          fromDirection={direction}
          toRef={toRef}
          onAnimationComplete={onGhostComplete}
        />
      )}
    </>
  );
}
