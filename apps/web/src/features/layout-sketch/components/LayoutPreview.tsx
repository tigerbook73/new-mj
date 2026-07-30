import { useMemo } from "react";
import { ActionDock } from "@/features/mahjong/components/ActionDock";
import { CenterStatus } from "@/features/mahjong/components/CenterStatus";
import { TableBoard, type SeatContent } from "@/features/mahjong/components/TableBoard";
import { createDesktopTableScenario } from "@/features/mahjong/components/scenarios/desktop";
import type { DiscardEntry } from "@/features/mahjong/components/DiscardPile";
import type { Meld } from "@/features/mahjong/components/MeldGroup";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import type { SketchDraft } from "@/features/layout-sketch/lib/layoutSketch";
import { exportSketchPreviewDraft } from "@/features/layout-sketch/lib/layoutSketch";

type PreviewCase = "baseline" | "dense" | "claims";

const labels: Record<PreviewCase, string> = {
  baseline: "Complete table",
  dense: "Dense discards",
  claims: "Melds and actions",
};

const makeSeat = (info: string, handTiles: number[], melds: Meld[] = []): SeatContent => ({
  info,
  handTiles,
  melds,
  revealed: info === "Tigerbook73",
  drawnSlotKey: `${info}-drawn`,
  drawnSlotEntering: false,
  meldEntering: false,
});

const seatsFor = (kind: PreviewCase): Record<SeatDirection, SeatContent> => ({
  bottom: makeSeat(
    "Tigerbook73",
    [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52],
    kind === "claims" ? [{ type: "peng", tiles: [56, 57, 58], fromDirection: "left" }] : [],
  ),
  right: makeSeat(
    "East",
    Array.from({ length: 13 }, (_, index) => 60 + index),
  ),
  top: makeSeat(
    "South",
    Array.from({ length: 13 }, (_, index) => 76 + index),
    kind === "claims" ? [{ type: "chi", tiles: [92, 96, 100], fromDirection: "right" }] : [],
  ),
  left: makeSeat(
    "West",
    Array.from({ length: 13 }, (_, index) => 108 + index),
  ),
});

const discardsFor = (kind: PreviewCase): Record<SeatDirection, DiscardEntry[]> => {
  const amount = kind === "dense" ? 24 : 9;
  const pile = (start: number): DiscardEntry[] =>
    Array.from({ length: amount }, (_, index) => ({
      tile: (start + index) % 136,
      ...(index === amount - 1 ? { justDiscarded: true } : {}),
    }));
  return { bottom: pile(0), right: pile(28), top: pile(56), left: pile(84) };
};

export function LayoutPreview({
  draft,
  previewCase,
  onPreviewCase,
}: {
  draft: SketchDraft;
  previewCase: PreviewCase;
  onPreviewCase: (value: PreviewCase) => void;
}) {
  const scenario = useMemo(
    () => createDesktopTableScenario(exportSketchPreviewDraft(draft), draft.tableConfig),
    [draft],
  );
  const seats = useMemo(() => seatsFor(previewCase), [previewCase]);
  const discards = useMemo(() => discardsFor(previewCase), [previewCase]);
  const actions =
    previewCase === "claims" ? [{ type: "peng", tile: 56 }, { type: "pass" }] : [{ type: "pass" }];
  return (
    <section
      data-testid="layout-real-preview"
      className="col-start-2 row-span-2 flex min-w-0 flex-col overflow-hidden bg-slate-950 p-6"
    >
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-slate-400">Sample</span>
        <select
          aria-label="Preview sample"
          className="rounded border border-slate-600 bg-slate-800 p-1 text-slate-100"
          value={previewCase}
          onChange={(event) => onPreviewCase(event.currentTarget.value as PreviewCase)}
        >
          {(Object.keys(labels) as PreviewCase[]).map((key) => (
            <option key={key} value={key}>
              {labels[key]}
            </option>
          ))}
        </select>
      </div>
      <div
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center"
        style={{ containerType: "size" }}
      >
        <TableBoard
          scenario={scenario}
          seats={seats}
          discards={discards}
          currentDirection="bottom"
          center={<CenterStatus phase="discard" currentSeat={0} wallCount={58} />}
          actionDock={
            <ActionDock
              actions={actions}
              hand={seats.bottom.handTiles}
              melds={seats.bottom.melds}
              lastDiscard={56}
              config={scenario.config}
              onAction={() => undefined}
            />
          }
        />
      </div>
    </section>
  );
}
