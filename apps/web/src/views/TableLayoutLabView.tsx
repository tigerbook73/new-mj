import { useEffect, useMemo, useState } from "react";
import { LayoutLabPreview } from "@/components/layout-lab/LayoutLabPreview";
import {
  DEFAULT_TABLE_LAYOUT_CONFIG,
  normalizeTableLayoutConfig,
  readTableLayoutConfig,
  type TableLayoutConfig,
  writeTableLayoutConfig,
} from "@/lib/tableLayoutLab";

type ViewportName = "fit" | "desktop" | "compact" | "portrait" | "landscape";
type ConfigSection = Exclude<keyof TableLayoutConfig, "version">;
const viewports: Record<ViewportName, { label: string; width?: number; height?: number }> = {
  fit: { label: "Fit available space" },
  desktop: { label: "1440 × 900", width: 1440, height: 900 },
  compact: { label: "1366 × 768", width: 1366, height: 768 },
  portrait: { label: "390 × 844", width: 390, height: 844 },
  landscape: { label: "844 × 390", width: 844, height: 390 },
};

function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_5rem] items-center text-sm">
      <span>{label}</span>
      <input
        className="rounded border bg-background px-2 py-1"
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className={`grid gap-2 rounded border border-amber-200 p-3 ${className}`}>
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

export function TableLayoutLabView() {
  const [config, setConfig] = useState(readTableLayoutConfig);
  const [drawn, setDrawn] = useState(true);
  const [viewport, setViewport] = useState<ViewportName>("fit");
  const [message, setMessage] = useState("Loaded local layout");
  const [json, setJson] = useState("");
  const [controlsOpen, setControlsOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeTableLayoutConfig(config);
      setMessage("Saved locally");
    }, 150);
    return () => window.clearTimeout(timer);
  }, [config]);

  const selectedViewport = viewports[viewport];
  const previewStyle = useMemo(() => {
    if (!selectedViewport.width || !selectedViewport.height)
      return { width: "100%", height: "100%" };
    const ratio = selectedViewport.width / selectedViewport.height;
    return {
      aspectRatio: `${selectedViewport.width}/${selectedViewport.height}`,
      width: `min(100cqw, calc(100cqh * ${ratio}))`,
      height: `min(100cqh, calc(100cqw / ${ratio}))`,
    };
  }, [selectedViewport]);
  const patch = <K extends ConfigSection>(section: K, next: Partial<TableLayoutConfig[K]>) =>
    setConfig((current) =>
      normalizeTableLayoutConfig({ ...current, [section]: { ...current[section], ...next } }),
    );
  const exportJson = JSON.stringify(config, null, 2);

  const copy = async (content: string, success: string) => {
    await navigator.clipboard.writeText(content);
    setMessage(success);
  };

  return (
    <main
      className="grid h-dvh grid-cols-1 overflow-hidden bg-slate-200 text-slate-950 md:grid-cols-[minmax(0,1fr)_22rem]"
      data-testid="layout-lab-page"
    >
      <button
        className="fixed top-3 right-3 z-30 rounded bg-slate-950 px-3 py-2 text-xs text-white md:hidden"
        onClick={() => setControlsOpen((open) => !open)}
      >
        {controlsOpen ? "Close controls" : "Layout controls"}
      </button>
      <section
        className="grid min-h-0 place-items-center overflow-hidden p-4"
        aria-label="Layout preview"
        style={{ containerType: "size" }}
      >
        <div
          className="grid h-full w-full place-items-center border border-slate-400 bg-slate-100"
          data-testid="layout-lab-viewport"
          style={{ ...previewStyle, containerType: "size" }}
        >
          <LayoutLabPreview config={config} drawn={drawn} realTiles />
        </div>
      </section>

      <aside
        className={`min-h-0 overflow-y-auto border-l bg-background p-4 text-foreground transition-transform max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-20 max-md:w-[min(22rem,92vw)] ${controlsOpen ? "max-md:translate-x-0" : "max-md:translate-x-full"}`}
        aria-label="Layout controls"
      >
        <h1 className="text-lg font-semibold">Table Layout Lab</h1>
        <div className="grid gap-4">
          <Section title="Preview">
            <label className="grid gap-1 text-xs">
              Viewport
              <select
                aria-label="Viewport"
                className="rounded border bg-background px-2 py-1"
                value={viewport}
                onChange={(event) => setViewport(event.target.value as ViewportName)}
              >
                {Object.entries(viewports).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-between">
              <label className="flex items-center gap-2 text-xs">
                <input
                  aria-label="Drawn tile"
                  type="checkbox"
                  checked={drawn}
                  onChange={(event) => setDrawn(event.target.checked)}
                />
                Show drawn tile
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={config.debug.showRegions}
                  onChange={(event) => patch("debug", { showRegions: event.target.checked })}
                />
                showRegions
              </label>
            </div>

            <NumberControl
              label="Aspect ratio"
              value={config.tiles.aspectRatio}
              min={1.2}
              max={1.8}
              step={0.05}
              onChange={(value) => patch("tiles", { aspectRatio: value })}
            />
            <NumberControl
              label="Tile gap px"
              value={config.tiles.tileGapPx}
              min={0}
              max={8}
              step={0.1}
              onChange={(value) => patch("tiles", { tileGapPx: value })}
            />
          </Section>
          <Section title="Hand region">
            <NumberControl
              label="Player track %"
              value={config.hand.trackPct}
              min={5}
              max={30}
              onChange={(value) => patch("hand", { trackPct: value })}
            />
            <NumberControl
              label="Hand tile count"
              value={config.hand.tileCount}
              min={0}
              max={13}
              onChange={(value) => patch("hand", { tileCount: value })}
            />
            <NumberControl
              label="Hand tile height %"
              value={config.hand.tileHeightPct}
              min={5}
              max={80}
              onChange={(value) => patch("hand", { tileHeightPct: value })}
            />
            <NumberControl
              label="Hand side column width %"
              value={config.hand.sideWidthPct}
              min={5}
              max={30}
              onChange={(value) => patch("hand", { sideWidthPct: value })}
            />
          </Section>
          <Section title="Meld / Info region">
            <NumberControl
              label="Meld+Info track %"
              value={config.meldInfo.trackPct}
              min={5}
              max={30}
              onChange={(value) => patch("meldInfo", { trackPct: value })}
            />
            <NumberControl
              label="Meld region width %"
              value={config.meldInfo.meldWidthPct}
              min={10}
              max={90}
              onChange={(value) => patch("meldInfo", { meldWidthPct: value })}
            />
            <NumberControl
              label="Meld height % (bottom-aligned)"
              value={config.meldInfo.meldHeightPct}
              min={10}
              max={100}
              onChange={(value) => patch("meldInfo", { meldHeightPct: value })}
            />
            <NumberControl
              label="Meld tile height %"
              value={config.meldInfo.meldTileHeightPct}
              min={5}
              max={80}
              onChange={(value) => patch("meldInfo", { meldTileHeightPct: value })}
            />
            <NumberControl
              label="Meld group count"
              value={config.meldInfo.meldGroupCount}
              min={0}
              max={4}
              onChange={(value) => patch("meldInfo", { meldGroupCount: value })}
            />
          </Section>
          <Section title="Discard region">
            <div className="flex justify-between">
              <label>Layout</label>
              <div className="flex gap-2">
                <button
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => patch("discard", { columns: 14, rows: 2 })}
                >
                  14×2
                </button>
                <button
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => patch("discard", { columns: 8, rows: 3 })}
                >
                  8×3
                </button>
                <button
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => patch("discard", { columns: 6, rows: 4 })}
                >
                  6×4
                </button>
              </div>{" "}
            </div>
            <NumberControl
              label="Discard track %"
              value={config.discard.trackPct}
              min={5}
              max={34}
              onChange={(value) => patch("discard", { trackPct: value })}
            />
            <NumberControl
              label="Discard tile height %"
              value={config.tiles.discardShortPct}
              min={5}
              max={80}
              onChange={(value) => patch("tiles", { discardShortPct: value })}
            />
          </Section>
          <Section title="Save / transfer">
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => {
                  setConfig(structuredClone(DEFAULT_TABLE_LAYOUT_CONFIG));
                  setMessage("Reset to defaults");
                }}
              >
                Reset defaults
              </button>
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => void copy(exportJson, "Copied JSON")}
              >
                Copy JSON
              </button>
            </div>
          </Section>
        </div>
      </aside>
    </main>
  );
}
