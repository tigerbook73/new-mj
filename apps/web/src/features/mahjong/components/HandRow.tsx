import { useRef } from "react";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import { isCaishenTile } from "@/features/mahjong/lib/mahjongTiles";
import { useSlotEntering } from "@/features/mahjong/lib/useSlotEntering";
import { DrawFlipGhost } from "./DrawFlipGhost";
import { Tile } from "./Tile";

/**
 * Measures a hand tile's own on-screen rect synchronously, from inside its
 * click handler — before the click's `game:action` ack (let alone the next
 * server snapshot) has any chance to land. TileId is globally unique on the
 * table at any instant (see docs/architecture/frontend-layout.md §5), so
 * this needs no direction/testid scoping to find the right element. See
 * DiscardFlipGhost.tsx for why the discard flight can't just measure a live
 * "from" element the way ClaimFlipGhost/DrawFlipGhost do.
 */
function captureTileRect(tileId: number): DOMRect | undefined {
  return document.querySelector(`[data-tile-id="${tileId}"]`)?.getBoundingClientRect();
}

interface HandRowProps {
  direction: SeatDirection;
  /** See SeatContent.handTiles (components/mahjong/TableBoard.tsx) for the slot layout. */
  handTiles: number[];
  revealed: boolean;
  /** See SeatContent.reflow (components/mahjong/TableBoard.tsx). */
  reflow: boolean;
  /** Whether this fixed drawn slot plays its live entry/ghost animation. */
  animateDraw: boolean;
  interactive?: boolean | undefined;
  /**
   * `originRect` is this tile's own `getBoundingClientRect()`, captured
   * synchronously inside the click handler (see `captureTileRect` below) —
   * pure geometry, not game state. By the time the server confirms the
   * discard and a fresh snapshot renders, the tile has genuinely left the
   * hand array and there's no live element left to measure — see
   * DiscardFlipGhost.tsx.
   */
  onDiscard?: ((tile: number, originRect?: DOMRect) => void) | undefined;
  tileHeight: number;
  tileGapPx: number;
  /** See SeatContent.drawnSlotKey / drawnSlotLedgerKey (components/mahjong/TableBoard.tsx). */
  drawnSlotKey: string;
  drawnSlotLedgerKey: string;
  /** See SeatContent.highlightCaishen (components/mahjong/TableBoard.tsx). */
  highlightCaishen: boolean;
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
  reflow,
  animateDraw,
  interactive,
  onDiscard,
  tileHeight: tileHeight,
  tileGapPx,
  drawnSlotKey,
  drawnSlotLedgerKey,
  highlightCaishen,
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
              reflow={reflow}
              animateDraw={animateDraw}
              interactive={interactive}
              onDiscard={onDiscard}
              tileHeight={tileHeight}
              ledgerKey={drawnSlotLedgerKey}
              caishen={isReal && highlightCaishen && isCaishenTile(tileId)}
            />
          );
        }
        // A real revealed tile keys by its own TileId (globally unique — see
        // docs/architecture/frontend-layout.md §5) so discarding one unmounts
        // exactly that instance instead of every slot after it silently
        // swapping to the next tile's face. Opponents' "rest" slots are
        // meaningless filler (all `0`, see SeatContent.handTiles) and the
        // empty gap slot is always `-1` — both stay position-keyed. Prefixed
        // (not bare numbers): `index` and `tileId` share the same numeric
        // range, so an unprefixed mix collided in practice — a real TileId of
        // e.g. 13 matched the gap slot's index for a ~14-tile hand, React
        // logged a duplicate-key warning, and both slots fought over one DOM
        // node.
        // TODO(tigerbook73): revisit whether this dual key-space (tileId vs.
        // index, disambiguated only by string prefix) should be redesigned
        // instead of kept as a prefix workaround.
        const key = isReal ? `tile-${tileId}` : `slot-${index}`;
        return (
          <Tile
            key={key}
            tileId={tileId}
            back={!revealed && !isPlaceholder}
            height={`${tileHeight}%`}
            clickable={interactive && isReal}
            // Lets the remaining hand tiles glide into their closed-up
            // positions when one is discarded and unmounts (tileId-keyed
            // above) — motion's `layout` (see Tile.tsx's `reflow` doc).
            // Off whenever `reflow` is false: a non-revealed opponent's
            // "rest" slots are anonymous filler keyed by position, so
            // `layout` would read as their whole hand sliding as one block
            // (nothing identifiable closing a gap); a revealed god-mode
            // left/right seat has real per-tile keys but sits under a
            // rotated ancestor Zone that breaks Motion's FLIP math — see
            // useTablePresentation.ts's `godReflow` doc.
            reflow={reflow}
            caishen={isReal && highlightCaishen && isCaishenTile(tileId)}
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
 * pinned drawn-tile slot, via `useSlotEntering` (see its own docs for why
 * this is safe against unrelated re-renders). Remounts fresh on every new
 * draw (keyed by `drawnSlotKey` in HandRow), so the resolution is re-read
 * correctly each time.
 */
function DrawnSlotTile({
  direction,
  tileId,
  isReal,
  revealed,
  reflow,
  animateDraw,
  interactive,
  onDiscard,
  tileHeight,
  ledgerKey,
  caishen,
}: {
  direction: SeatDirection;
  tileId: number;
  isReal: boolean;
  revealed: boolean;
  reflow: boolean;
  animateDraw: boolean;
  interactive?: boolean | undefined;
  onDiscard?: ((tile: number, originRect?: DOMRect) => void) | undefined;
  tileHeight: number;
  ledgerKey: string;
  caishen: boolean;
}) {
  const { entering, ghost, onGhostComplete } = useSlotEntering(ledgerKey, animateDraw);
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
            // "opacityOnly": DrawFlipGhost already sells the arrival's
            // physical motion on its own path — see resolveTileMotion.ts.
            entering={entering ? "opacityOnly" : false}
            // Same `reflow` as the plain hand tiles above, kept consistent
            // for clarity — this slot always remounts fresh on a new draw,
            // so `layout` never actually has a prior instance to FLIP from.
            reflow={reflow}
            testId={`hand-track-drawn-${direction}`}
            caishen={caishen}
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
