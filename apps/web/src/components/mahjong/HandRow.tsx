import { useRef, useState } from "react";
import type { SeatDirection } from "@/lib/seatLayout";
import { DrawFlipGhost } from "./DrawFlipGhost";
import { Tile } from "./Tile";

/**
 * Measures a hand tile's own on-screen rect synchronously, from inside its
 * click handler — before the click's `game:action` ack (let alone the next
 * server snapshot) has any chance to land. TileId is globally unique on the
 * table at any instant (architecture iron rule 4), so this needs no
 * direction/testid scoping to find the right element. See DiscardFlipGhost.tsx
 * for why the discard flight can't just measure a live "from" element the way
 * ClaimFlipGhost/DrawFlipGhost do.
 */
function captureTileRect(tileId: number): DOMRect | undefined {
  return document.querySelector(`[data-tile-id="${tileId}"]`)?.getBoundingClientRect();
}

interface HandRowProps {
  direction: SeatDirection;
  /** See SeatContent.handTiles (components/mahjong/TableBoard.tsx) for the slot layout. */
  handTiles: number[];
  revealed: boolean;
  interactive?: boolean | undefined;
  /**
   * `originRect` is this tile's own `getBoundingClientRect()`, captured
   * synchronously inside the click handler (see `captureTileRect` below) —
   * pure geometry, not game state (architecture iron rule 5 is unaffected).
   * By the time the server confirms the discard and a fresh snapshot
   * renders, the tile has genuinely left the hand array and there's no live
   * element left to measure — see DiscardFlipGhost.tsx.
   */
  onDiscard?: ((tile: number, originRect?: DOMRect) => void) | undefined;
  tileHeightPct: number;
  tileGapPx: number;
  /** See SeatContent.drawnSlotKey / drawnSlotEntering (components/mahjong/TableBoard.tsx). */
  drawnSlotKey: string;
  drawnSlotEntering: boolean;
}

/**
 * One flat, right-anchored row for every seat. The trailing slot (index
 * length-1) is always the pinned just-drawn tile or an empty gap-sized
 * placeholder; the one before it is always an empty spacer — both come
 * pre-baked into `handTiles` (see useTablePresentation.ts) so this component
 * never has to reason about drawn-tile state itself.
 */
export function HandRow({
  direction,
  handTiles,
  revealed,
  interactive,
  onDiscard,
  tileHeightPct,
  tileGapPx,
  drawnSlotKey,
  drawnSlotEntering,
}: HandRowProps) {
  const drawnIndex = handTiles.length - 1;
  return (
    <div
      className="flex h-full w-full flex-nowrap items-center justify-end"
      style={{ gap: `${tileGapPx}px` }}
    >
      {handTiles.map((tileId, index) => {
        const isPlaceholder = tileId < 0;
        const isReal = revealed && !isPlaceholder;
        const isDrawnSlot = index === drawnIndex;
        if (isDrawnSlot) {
          return (
            <DrawnSlotTile
              key={drawnSlotKey}
              direction={direction}
              tileId={tileId}
              isReal={isReal}
              revealed={revealed}
              interactive={interactive}
              onDiscard={onDiscard}
              tileHeightPct={tileHeightPct}
              entering={drawnSlotEntering}
            />
          );
        }
        // A real revealed tile keys by its own TileId (globally unique —
        // architecture iron rule 4) so discarding one unmounts exactly that
        // instance instead of every slot after it silently swapping to the
        // next tile's face. Opponents' "rest" slots are meaningless filler
        // (all `0`, see SeatContent.handTiles) and the empty gap slot is
        // always `-1` — both stay position-keyed. Prefixed (not bare
        // numbers): `index` and `tileId` share the same numeric range, so an
        // unprefixed mix collided in practice — a real TileId of e.g. 13
        // matched the gap slot's index for a ~14-tile hand, React logged a
        // duplicate-key warning, and both slots fought over one DOM node.
        const key = isReal ? `tile-${tileId}` : `slot-${index}`;
        return (
          <Tile
            key={key}
            tileId={tileId}
            back={!revealed && !isPlaceholder}
            heightPx={`${tileHeightPct}%`}
            clickable={interactive && isReal}
            // Lets the remaining hand tiles glide into their new positions
            // when one is discarded and unmounts (tileId-keyed above), or
            // when the gap/drawn slot's own position shifts as a result —
            // motion's `layout` (not `layoutId`, no shared-id involved) is
            // the textbook tool for "siblings smoothly reflow when one
            // leaves", independent of whatever flies the departed tile to
            // the discard pile (a separate ghost clone, see MeldGroup.tsx's
            // ClaimFlipGhost for the established pattern). Scoped to
            // `revealed` (my own row) only — an opponent's "rest" slots are
            // position-keyed anonymous filler (see the `key` comment below),
            // so when their handCount shrinks (e.g. a peng/chi pulls tiles
            // out of their concealed hand), the *surviving* filler slots keep
            // the same key and just silently sit at a new position — with
            // `layout` on, that reads as their entire hand visibly sliding as
            // one block, which has no meaningful "gap closing" to show since
            // none of those tiles represent anything identifiable.
            reflow={revealed}
            {...(interactive && isReal
              ? { onClick: () => onDiscard?.(tileId, captureTileRect(tileId)) }
              : {})}
            {...(isReal ? { testId: "hand-tile" } : {})}
          />
        );
      })}
    </div>
  );
}

/**
 * Owns the per-draw hook state a plain `.map()` callback can't (rules of
 * hooks) — specifically, whether to mount a `DrawFlipGhost` alongside the
 * pinned drawn-tile slot. Captured once via `useState` rather than read live
 * from `entering`, same reasoning as MeldGroup.tsx's `MeldClaimTile`:
 * `drawnSlotEntering` (== canAnimateEntries) is only true for the single
 * render right after a live snapshot lands, so deciding "should this draw
 * get a ghost" on every render would unmount the ghost mid-flight the
 * moment any unrelated re-render happens to land while it's still playing.
 * Remounts fresh on every new draw (keyed by `drawnSlotKey` in HandRow), so
 * `shouldGhost` is re-captured correctly each time.
 */
function DrawnSlotTile({
  direction,
  tileId,
  isReal,
  revealed,
  interactive,
  onDiscard,
  tileHeightPct,
  entering,
}: {
  direction: SeatDirection;
  tileId: number;
  isReal: boolean;
  revealed: boolean;
  interactive?: boolean | undefined;
  onDiscard?: ((tile: number, originRect?: DOMRect) => void) | undefined;
  tileHeightPct: number;
  entering: boolean;
}) {
  const [shouldGhost] = useState(entering);
  const toRef = useRef<HTMLDivElement>(null);
  const isPlaceholder = tileId < 0;

  return (
    <>
      {/*
       * `items-center`, matching the row's own cross-axis alignment: the Tile
       * inside is only `tileHeightPct`% tall (not 100%, unlike DiscardPile/
       * MeldGroup's TileClaimSlot wrappers, which are always 100% all the way
       * down) — without re-centering here, a shorter-than-full-height child
       * sits at the wrapper's top edge instead of centered, so this slot's
       * tile no longer lines up with the rest of the hand row.
       */}
      <div ref={toRef} className="flex h-full items-center">
        <Tile
          tileId={tileId}
          back={!revealed && !isPlaceholder}
          heightPx={`${tileHeightPct}%`}
          clickable={interactive && isReal}
          entering={entering}
          // See the `reflow={revealed}` comment above — same scoping applies
          // here too, though this slot always remounts fresh on a new draw
          // (keyed by `drawnSlotKey`), so `layout` never actually has a prior
          // instance to FLIP from either way; kept consistent for clarity.
          reflow={revealed}
          testId={`hand-track-drawn-${direction}`}
          {...(interactive && isReal
            ? { onClick: () => onDiscard?.(tileId, captureTileRect(tileId)) }
            : {})}
        />
      </div>
      {shouldGhost && <DrawFlipGhost {...(isReal ? { tileId } : {})} toRef={toRef} />}
    </>
  );
}
