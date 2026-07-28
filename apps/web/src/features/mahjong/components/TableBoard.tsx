import type { ReactNode } from "react";
import { assertLayoutPreset, ZoneRenderer, type LayoutPreset, type Zone } from "@/shared/lib/layoutPreset";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import type { DiscardEntry } from "./DiscardPile";
import type { Meld } from "./MeldGroup";

export interface SeatContent {
  melds: Meld[];
  /**
   * Left-to-right render order: the concealed hand, then always exactly two
   * trailing slots — an empty gap, then the just-drawn tile (or another
   * empty slot when nobody has just drawn) — so the pinned drawn-tile
   * position never shifts the row's total width. `revealed` decides whether
   * these are real TileIds (my own seat) or meaningless filler (opponents,
   * rendered face-down); a negative entry is always an empty placeholder
   * regardless (see Tile.tsx).
   */
  handTiles: number[];
  /** True only for my own seat — opponents' handTiles entries render face-down. */
  revealed: boolean;
  interactive?: boolean | undefined;
  /** See HandRow.tsx's `captureTileRect` for why `originRect` is a plain measured value, not game state. */
  onDiscard?: ((tile: number, originRect?: DOMRect) => void) | undefined;
  /** Player nickname (or "Seat N" fallback) — rendered as SVG text, see InfoSlot. */
  info: string;
  /**
   * React key for the pinned drawn-tile slot (the last `handTiles` entry) —
   * distinct from every other slot's plain index key so a genuinely new draw
   * mounts a fresh Tile instance (motion's `initial`/`animate` only fires on
   * mount, see Tile.tsx). Stable/unchanged across re-renders that don't
   * represent a new draw, so it never remounts (and thus never replays the
   * entry animation) for unrelated state changes.
   */
  drawnSlotKey: string;
  /** Gates the pinned drawn-tile slot's one-shot entry animation — see useIsIncrementalSnapshot / usePrefersReducedMotion. */
  drawnSlotEntering: boolean;
  /**
   * Gates meld tiles' one-shot entry animation. Unlike drawnSlotEntering, no
   * per-tile targeting is needed: a whole new meld (chi/peng/minGang/anGang)
   * is a brand-new `melds` array entry, and buGang's added 4th tile is a
   * genuinely new TileId within an existing meld — both cases already mount
   * fresh Tile instances under MeldGroup's existing tile-identity keys, so
   * passing this uniformly to every meld tile only visibly animates the ones
   * that actually mount this render (see Tile.tsx's `initial`-only-at-mount
   * semantics).
   */
  meldEntering: boolean;
}

/**
 * Business data every zone component may draw from, regardless of which
 * screen scenario (desktop / future mobile layouts) is currently mounted.
 * This contract stays fixed across scenarios — only the LayoutPreset and the
 * id → component bindings vary per scenario (see components/mahjong/scenarios/).
 */
export interface TableZoneContext {
  zone: Zone;
  children: ReactNode;
  seats: Record<SeatDirection, SeatContent>;
  discards: Record<SeatDirection, DiscardEntry[]>;
  center: ReactNode;
  actionDock?: ReactNode | undefined;
  currentDirection?: SeatDirection | undefined;
}

export type TableZoneComponent = (ctx: TableZoneContext) => ReactNode;

/** A LayoutPreset bundled with the zone components that render into it — the atomic unit a screen scenario swaps. */
export interface TableScenario {
  preset: LayoutPreset;
  components: Readonly<Record<string, TableZoneComponent>>;
}

interface TableBoardProps {
  scenario: TableScenario;
  seats: Record<SeatDirection, SeatContent>;
  discards: Record<SeatDirection, DiscardEntry[]>;
  center: ReactNode;
  actionDock?: ReactNode;
  currentDirection?: SeatDirection | undefined;
}

/** Pure geometry-to-content wiring: which LayoutPreset and which components render it come entirely from `scenario`. */
export function TableBoard({
  scenario,
  seats,
  discards,
  center,
  actionDock,
  currentDirection,
}: TableBoardProps) {
  assertLayoutPreset(scenario.preset, Object.keys(scenario.components));
  return (
    <div
      data-testid="table-core"
      className="rounded-xl bg-green-800 shadow-lg ring-2 ring-border dark:bg-green-950"
      style={{
        width: "min(100cqw,100cqh)",
        height: "min(100cqw,100cqh)",
        boxSizing: "border-box",
        containerType: "size",
      }}
    >
      <ZoneRenderer
        zone={scenario.preset.root}
        renderService={(zone, children) =>
          scenario.components[zone.id]?.({
            zone,
            children,
            seats,
            discards,
            center,
            actionDock,
            currentDirection,
          }) ?? null
        }
      />
    </div>
  );
}
