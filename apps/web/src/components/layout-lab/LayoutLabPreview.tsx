import { Tile } from "@/components/mahjong/Tile";
import { DirectionalSurface, Ring } from "@/components/mahjong/TableGeometry";
import { HandTrack } from "@/components/mahjong/HandTrack";
import { MeldInfoTrack } from "@/components/mahjong/MeldInfoTrack";
import { fitTileGrid } from "@/lib/tableGeometry";
import type { SeatDirection } from "@/lib/seatLayout";
import type { TableLayoutConfig } from "@/lib/tableLayoutLab";
import { useMeasuredSize } from "@/lib/useMeasuredSize";

const DIRECTIONS: SeatDirection[] = ["top", "left", "right", "bottom"];

function Slots({
  area,
  direction,
  columns,
  rows = 1,
  count,
  heightPct,
  config,
  facedown = false,
  growth = "start",
  realTiles = false,
  containerWidthPx,
  containerHeightPx,
}: {
  area: "meld" | "discard";
  direction: SeatDirection;
  columns: number;
  rows?: number;
  count: number;
  heightPct: number;
  config: TableLayoutConfig;
  facedown?: boolean;
  growth?: "start" | "end" | "center";
  realTiles?: boolean;
  /** Real measured content-box pixels of the immediate parent region. */
  containerWidthPx: number;
  containerHeightPx: number;
}) {
  const capacity = columns * rows;
  const { tileWidthPx, tileHeightPx } = fitTileGrid(containerWidthPx, containerHeightPx, {
    columns,
    rows,
    heightPct,
    aspectRatio: config.tiles.aspectRatio,
    tileGapPx: config.tiles.tileGapPx,
  });
  const occupiedStart = growth === "end" ? Math.max(0, capacity - count) : 0;
  const occupiedEnd = growth === "end" ? capacity : Math.min(capacity, count);
  return (
    <div
      className="grid self-center"
      style={{
        gap: `${config.tiles.tileGapPx}px`,
        justifySelf: growth,
        gridTemplateColumns: `repeat(${columns}, ${tileWidthPx}px)`,
        gridTemplateRows: `repeat(${rows}, ${tileHeightPx}px)`,
      }}
    >
      {Array.from({ length: capacity }, (_, slot) => {
        const occupied = slot >= occupiedStart && slot < occupiedEnd;
        const testId = `lab-slot-${area}-${direction}-${slot}`;
        if (occupied && realTiles) {
          return (
            <Tile
              key={slot}
              {...(facedown ? {} : { tileId: (slot * 7) % 136 })}
              back={facedown}
              widthPx={tileWidthPx}
              heightPx={tileHeightPx}
              testId={testId}
            />
          );
        }
        return (
          <span
            key={slot}
            data-testid={testId}
            data-empty={!occupied || undefined}
            className={`block border border-slate-950 ${!occupied ? "invisible" : ""} ${occupied ? (facedown ? "bg-slate-400" : "bg-[#e8d4b0]") : "bg-transparent"}`}
            style={{ boxSizing: "border-box" }}
          />
        );
      })}
    </div>
  );
}

const MELD_GROUP_SIZE = 3;

/** Synthetic hand tiles for the Lab preview — real hand rendering (HandRow) is production-only, see TableBoard.tsx. */
function LabHandTiles({
  direction,
  config,
  realTiles,
  tileWidthPx,
  tileHeightPx,
}: {
  direction: SeatDirection;
  config: TableLayoutConfig;
  realTiles: boolean;
  tileWidthPx: number;
  tileHeightPx: number;
}) {
  const facedown = direction !== "bottom";
  const shownCount = config.hand.tileCount;
  return (
    <div
      className="grid"
      style={{
        gap: `${config.tiles.tileGapPx}px`,
        gridTemplateColumns: `repeat(${shownCount}, ${tileWidthPx}px)`,
        gridTemplateRows: `${tileHeightPx}px`,
      }}
    >
      {Array.from({ length: shownCount }, (_, slot) =>
        realTiles ? (
          <Tile
            key={slot}
            {...(facedown ? {} : { tileId: (slot * 7) % 136 })}
            back={facedown}
            widthPx={tileWidthPx}
            heightPx={tileHeightPx}
            testId={`lab-slot-hand-${direction}-${slot}`}
          />
        ) : (
          <span
            key={slot}
            data-testid={`lab-slot-hand-${direction}-${slot}`}
            className={`block border border-slate-950 ${facedown ? "bg-slate-400" : "bg-[#e8d4b0]"}`}
            style={{ boxSizing: "border-box" }}
          />
        ),
      )}
    </div>
  );
}

/** Synthetic meld tiles for the Lab preview — real meld rendering (MeldGroup) is production-only, see TableBoard.tsx. */
function LabMeldTiles({
  direction,
  config,
  realTiles,
  tileWidthPx,
  tileHeightPx,
}: {
  direction: SeatDirection;
  config: TableLayoutConfig;
  realTiles: boolean;
  tileWidthPx: number;
  tileHeightPx: number;
}) {
  return (
    <div
      className="flex h-full flex-wrap content-end items-end justify-start overflow-hidden"
      style={{ gap: `${config.tiles.tileGapPx * 2}px`, boxSizing: "border-box" }}
    >
      {Array.from({ length: config.meldInfo.meldGroupCount }, (_, groupIndex) => (
        <div key={groupIndex} className="flex" style={{ gap: `${config.tiles.tileGapPx}px` }}>
          {Array.from({ length: MELD_GROUP_SIZE }, (_, tileIndex) => {
            const slot = groupIndex * MELD_GROUP_SIZE + tileIndex;
            return realTiles ? (
              <Tile
                key={tileIndex}
                tileId={(groupIndex * MELD_GROUP_SIZE * 7) % 136}
                widthPx={tileWidthPx}
                heightPx={tileHeightPx}
                testId={`lab-slot-meld-${direction}-${slot}`}
              />
            ) : (
              <span
                key={tileIndex}
                data-testid={`lab-slot-meld-${direction}-${slot}`}
                className="block border border-slate-950 bg-[#e8d4b0]"
                style={{ width: tileWidthPx, height: tileHeightPx, boxSizing: "border-box" }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TableTrack({
  direction,
  config,
  realTiles,
}: {
  direction: SeatDirection;
  config: TableLayoutConfig;
  realTiles: boolean;
}) {
  const [contentRef, contentSize] = useMeasuredSize<HTMLDivElement>();
  return (
    <DirectionalSurface direction={direction} testId={`lab-region-discard-${direction}`}>
      <div
        ref={contentRef}
        data-testid={`lab-region-content-discard-${direction}`}
        className={`grid h-full w-full place-items-center ${config.debug.showRegions ? "border-2 border-dashed border-cyan-100" : ""}`}
        style={{
          boxSizing: "border-box",
        }}
      >
        <Slots
          area="discard"
          direction={direction}
          columns={config.discard.columns}
          rows={config.discard.rows}
          count={config.discard.columns * config.discard.rows - 1}
          heightPct={config.tiles.discardShortPct}
          config={config}
          growth="center"
          realTiles={realTiles}
          containerWidthPx={contentSize.width}
          containerHeightPx={contentSize.height}
        />
      </div>
    </DirectionalSurface>
  );
}

export function LayoutLabPreview({
  config,
  drawn,
  realTiles = false,
}: {
  config: TableLayoutConfig;
  drawn: boolean;
  realTiles?: boolean;
}) {
  return (
    <div
      className={`border-2 bg-green-800 font-mono text-white ${config.debug.showRegions ? "border-indigo-900" : "border-transparent"}`}
      data-testid="layout-lab-board"
      style={{ width: "min(100cqw,100cqh)", height: "min(100cqw,100cqh)", boxSizing: "border-box" }}
    >
      <Ring edge={config.hand.trackPct} className="h-full">
        {DIRECTIONS.map((direction) => (
          <HandTrack
            key={direction}
            direction={direction}
            config={config}
            drawn={{
              visible: drawn,
              ...(realTiles && direction === "bottom" ? { tileId: (13 * 7) % 136 } : {}),
            }}
            tileCount={config.hand.tileCount}
            testId={`lab-player-${direction}`}
            regionTestId={`lab-region-hand-${direction}`}
            drawnTestId={`lab-slot-hand-${direction}-draw`}
          >
            {({ tileWidthPx, tileHeightPx }) => (
              <LabHandTiles
                direction={direction}
                config={config}
                realTiles={realTiles}
                tileWidthPx={tileWidthPx}
                tileHeightPx={tileHeightPx}
              />
            )}
          </HandTrack>
        ))}
        <div
          className={`col-start-2 row-start-2 min-h-0 min-w-0 border ${config.debug.showRegions ? "border-emerald-400" : "border-transparent"}`}
        >
          <Ring edge={config.meldInfo.trackPct} className="h-full">
            {DIRECTIONS.map((direction) => (
              <MeldInfoTrack
                key={direction}
                direction={direction}
                config={config}
                testId={`lab-region-wall-${direction}`}
                contentTestId={`lab-region-content-wall-${direction}`}
                infoContent={`Player ${direction}`}
                renderMeld={({ tileWidthPx, tileHeightPx }) => (
                  <LabMeldTiles
                    direction={direction}
                    config={config}
                    realTiles={realTiles}
                    tileWidthPx={tileWidthPx}
                    tileHeightPx={tileHeightPx}
                  />
                )}
              />
            ))}
            <div
              className="col-start-2 row-start-2 min-h-0 min-w-0"
              data-testid="lab-wall-center"
              style={{ boxSizing: "border-box" }}
            >
              <Ring
                edge={config.discard.trackPct}
                className={`h-full border bg-cyan-700 ${config.debug.showRegions ? "border-lime-400" : "border-transparent"}`}
              >
                {DIRECTIONS.map((direction) => (
                  <TableTrack
                    key={direction}
                    direction={direction}
                    config={config}
                    realTiles={realTiles}
                  />
                ))}
                <div
                  className={`col-start-2 row-start-2 grid place-items-center border bg-slate-300 text-xs text-slate-950 ${config.debug.showRegions ? "border-slate-600" : "border-transparent"}`}
                >
                  Game 1/4
                  <br />
                  Wall 68
                </div>
              </Ring>
            </div>
          </Ring>
        </div>
      </Ring>
    </div>
  );
}
