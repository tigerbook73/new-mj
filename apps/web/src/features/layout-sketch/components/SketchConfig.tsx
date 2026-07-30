import type { TableLayoutConfig } from "@/features/mahjong/lib/tableLayoutConfig";
import { parseTableLayoutConfig } from "@/features/mahjong/lib/tableLayoutConfig";
import type { CSSProperties } from "react";

type NumberField = {
  label: string;
  path: string;
  min: number;
  max: number;
  step?: number;
};

const FIELDS: { title: string; fields: NumberField[] }[] = [
  {
    title: "Shared",
    fields: [
      { label: "Tile aspect ratio", path: "shared.aspectRatio", min: 1.2, max: 1.8, step: 0.001 },
      { label: "Tile gap px", path: "shared.tileGapPx", min: 0, max: 8, step: 0.1 },
    ],
  },
  {
    title: "Hand",
    fields: [{ label: "Tile height %", path: "handZone.tileHeight", min: 5, max: 80 }],
  },
  {
    title: "Meld",
    fields: [
      { label: "Row height %", path: "meldZone.meldHeight", min: 10, max: 100 },
      { label: "Tile height %", path: "meldZone.meldTileHeight", min: 5, max: 80 },
    ],
  },
  {
    title: "Discard",
    fields: [
      { label: "Columns", path: "discardZone.columns", min: 4, max: 14, step: 1 },
      { label: "Rows", path: "discardZone.rows", min: 2, max: 4, step: 1 },
      { label: "Row height %", path: "discardZone.discardShort", min: 5, max: 80 },
    ],
  },
  {
    title: "Action dock",
    fields: [
      { label: "Actions height %", path: "actionDockZone.actionsHeight", min: 20, max: 60 },
      { label: "Button height %", path: "actionDockZone.actionButtonHeight", min: 30, max: 90 },
      {
        label: "Wide label ratio",
        path: "actionDockZone.wideLabelWidthRatio",
        min: 1,
        max: 2,
        step: 0.1,
      },
      { label: "Candidate height %", path: "actionDockZone.candidateHeight", min: 30, max: 90 },
    ],
  },
];

const valueAt = (config: TableLayoutConfig, path: string) =>
  path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], config);

const withValue = (config: TableLayoutConfig, path: string, value: number): TableLayoutConfig => {
  const [section, key] = path.split(".") as [keyof TableLayoutConfig, string];
  return {
    ...config,
    [section]: { ...config[section], [key]: value },
  } as TableLayoutConfig;
};

export function SketchConfig({
  config,
  onUpdate,
  style,
}: {
  config: TableLayoutConfig;
  onUpdate: (config: TableLayoutConfig) => void;
  style?: CSSProperties | undefined;
}) {
  const update = (field: NumberField, raw: string, input: HTMLInputElement) => {
    const value = Number(raw);
    try {
      onUpdate(parseTableLayoutConfig(withValue(config, field.path, value)));
    } catch {
      input.value = String(valueAt(config, field.path));
    }
  };
  return (
    <section
      data-testid="layout-config-panel"
      className="layout-lab-scrollbar min-h-0 shrink-0 overflow-x-auto overflow-y-scroll border-t border-slate-700 px-3 py-4 scrollbar-gutter-stable"
      style={style}
    >
      <h2 className="mb-3 font-semibold">Config</h2>
      <div className="grid gap-4">
        {FIELDS.map((group) => (
          <fieldset key={group.title} className="grid gap-2">
            <legend className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {group.title}
            </legend>
            {group.fields.map((field) => (
              <label
                key={field.path}
                className="grid grid-cols-[1fr_5.5rem] items-center gap-2 text-sm"
              >
                <span>{field.label}</span>
                <input
                  aria-label={field.label}
                  className="min-w-0 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right"
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  value={valueAt(config, field.path) as number}
                  onChange={(event) =>
                    update(field, event.currentTarget.value, event.currentTarget)
                  }
                />
              </label>
            ))}
          </fieldset>
        ))}
        <label className="flex items-center justify-between gap-2 text-sm">
          Show zone guides
          <input
            aria-label="Show zone guides"
            type="checkbox"
            checked={config.debug.showRegions}
            onChange={(event) =>
              onUpdate({ ...config, debug: { showRegions: event.currentTarget.checked } })
            }
          />
        </label>
      </div>
    </section>
  );
}
