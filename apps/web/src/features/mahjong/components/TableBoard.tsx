import type { ReactNode } from "react";
import {
  assertLayoutPreset,
  ZoneRenderer,
  type LayoutPreset,
  type Zone,
} from "@/shared/lib/layoutPreset";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import type { DiscardEntry } from "./DiscardPile";
import type { Meld } from "./MeldGroup";
import type { TableLayoutConfig } from "@/features/mahjong/lib/tableLayoutConfig";

export interface TurnHighlight {
  direction: SeatDirection;
  /** Active: genuinely this seat's turn right now (scenarios typically also show an
   * arrow). Pending: this seat just discarded and a claim window is open —
   * currentSeat hasn't moved on yet (see junk/state-machine.ts's applyDiscard), so
   * it's a distinct, cooler color and no arrow, since the arrow would misleadingly
   * look like a live turn. */
  tone: "active" | "pending";
}

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
  /** Presentation-only identity for each hand slot. Real ids stay inside the
   * normal Tile contract; concealed slots receive opaque back-slot keys. */
  handTokenKeys: string[];
  /** True for my own seat, and for any seat god mode has real hand data for
   * — opponents otherwise render handTiles entries face-down. */
  revealed: boolean;
  /** Whether HandRow plays Motion's `layout` FLIP when handTiles reorders.
   * Bottom and the 180-degree top Zone can use it; quarter-turn left/right
   * Zones cannot compose Motion's generic projection correctly. */
  reflow: boolean;
  /** Whether this seat may play the live draw entry/ghost animation. */
  animateDraw: boolean;
  /** True only when the active ruleset has a caishen tile (currently only
   * hangzhou) — gates whether `handTiles` entries get Tile's `caishen`
   * highlight; see mahjongTiles.ts's `isCaishenTile`. */
  highlightCaishen: boolean;
  interactive?: boolean | undefined;
  /** See HandRow.tsx's `captureTileRect` for why `originRect` is a plain measured value, not game state. */
  onDiscard?: ((tile: number, originRect?: DOMRect) => void) | undefined;
  /** Player nickname (or "Seat N" fallback) — rendered as SVG text, see InfoSlot. */
  info: string;
  /** Public: RoomInfo.dealer says which seat is dealing this game — rendered as a
   * crown badge on the seat's own label instead of duplicating it in CenterStatus. */
  isDealer: boolean;
  /**
   * React key for the pinned drawn-tile slot (the last `handTiles` entry) —
   * distinct from every other slot's plain index key so a genuinely new draw
   * mounts a fresh Tile instance (motion's `initial`/`animate` only fires on
   * mount, see Tile.tsx). Stable/unchanged across re-renders that don't
   * represent a new draw, so it never remounts (and thus never replays the
   * entry animation) for unrelated state changes.
   */
  drawnSlotKey: string;
  /** animationLedger key for this seat's draw lane — see useSlotEntering, and useTablePresentation.ts's drawnSlotLedgerKey. */
  drawnSlotLedgerKey: string;
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
  /** Ruleset logo badge for the "game-info" zone — see desktopZoneComponents.tsx's DesktopGameInfoSlot. */
  gameInfo?: ReactNode | undefined;
  turnHighlight?: TurnHighlight | undefined;
  config: TableLayoutConfig;
}

export type TableZoneComponent = (ctx: TableZoneContext) => ReactNode;

/** A LayoutPreset bundled with the zone components that render into it — the atomic unit a screen scenario swaps. */
export interface TableScenario {
  preset: LayoutPreset;
  config: TableLayoutConfig;
  components: Readonly<Record<string, TableZoneComponent>>;
}

interface TableBoardProps {
  scenario: TableScenario;
  seats: Record<SeatDirection, SeatContent>;
  discards: Record<SeatDirection, DiscardEntry[]>;
  center: ReactNode;
  actionDock?: ReactNode;
  gameInfo?: ReactNode;
  turnHighlight?: TurnHighlight | undefined;
}

/** Pure geometry-to-content wiring: which LayoutPreset and which components render it come entirely from `scenario`. */
export function TableBoard({
  scenario,
  seats,
  discards,
  center,
  actionDock,
  gameInfo,
  turnHighlight,
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
            gameInfo,
            turnHighlight,
            config: scenario.config,
          }) ?? null
        }
      />
    </div>
  );
}
