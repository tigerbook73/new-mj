import { useRef } from "react";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import { useSlotEntering } from "@/features/mahjong/lib/useSlotEntering";
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
  tileHeight: number;
  tileGapPx: number;
  /** See SeatContent.drawnSlotKey / drawnSlotLedgerKey (components/mahjong/TableBoard.tsx). */
  drawnSlotKey: string;
  drawnSlotLedgerKey: string;
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
  tileHeight: tileHeight,
  tileGapPx,
  drawnSlotKey,
  drawnSlotLedgerKey,
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
              tileHeight={tileHeight}
              ledgerKey={drawnSlotLedgerKey}
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
            height={`${tileHeight}%`}
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
 * pinned drawn-tile slot. `useSlotEntering` reads animationLedger's
 * resolution for `ledgerKey` exactly once at mount, so a ghost already in
 * flight is never unmounted mid-flight by an unrelated re-render. Remounts
 * fresh on every new draw (keyed by `drawnSlotKey` in HandRow), so the
 * resolution is re-read correctly each time.
 */
function DrawnSlotTile({
  direction,
  tileId,
  isReal,
  revealed,
  interactive,
  onDiscard,
  tileHeight,
  ledgerKey,
}: {
  direction: SeatDirection;
  tileId: number;
  isReal: boolean;
  revealed: boolean;
  interactive?: boolean | undefined;
  onDiscard?: ((tile: number, originRect?: DOMRect) => void) | undefined;
  tileHeight: number;
  ledgerKey: string;
}) {
  const { entering, ghost, onGhostComplete } = useSlotEntering(ledgerKey);
  const toRef = useRef<HTMLDivElement>(null);
  const isPlaceholder = tileId < 0;

  return (
    <>
      {/*
       * `items-center`, matching the row's own cross-axis alignment: the Tile
       * inside is only `tileHeight`% tall (not 100%, unlike DiscardPile/
       * MeldGroup's TileClaimSlot wrappers, which are always 100% all the way
       * down) — without re-centering here, a shorter-than-full-height child
       * sits at the wrapper's top edge instead of centered, so this slot's
       * tile no longer lines up with the rest of the hand row. `toRef` sits
       * on the inner, tile-sized box (not this outer full-height one) —
       * DrawFlipGhost measures it via `getBoundingClientRect()` to size
       * itself, and measuring the taller centering wrapper instead made the
       * ghost render visibly oversized (full row height, not the tile's own)
       * for its entire flight.
       */}
      <div className="flex h-full items-center">
        <div ref={toRef} style={{ height: `${tileHeight}%`, aspectRatio: "1 / 1.333" }}>
          <Tile
            tileId={tileId}
            back={!revealed && !isPlaceholder}
            height="100%"
            clickable={interactive && isReal}
            // DrawFlipGhost already flies in and sells the arrival's physical
            // motion on its own path (from the table's center); this real tile
            // independently rising from below at its destination — let alone
            // popping 0.75→1 too — would visibly clash with that flight rather
            // than read as one motion, so it skips scale and rise, keeping only
            // the fade ("opacityOnly" — see Tile.tsx's `entering` docs).
            entering={entering ? "opacityOnly" : false}
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
      </div>
      {ghost && (
        <DrawFlipGhost
          {...(isReal ? { tileId } : {})}
          toRef={toRef}
          onAnimationComplete={onGhostComplete}
        />
      )}
    </>
  );
}
