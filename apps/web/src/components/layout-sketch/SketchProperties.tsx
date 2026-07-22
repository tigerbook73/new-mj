import { type RefObject } from "react";
import { type RotationDeg } from "@/lib/layoutPreset";
import { type SketchNode, type SketchPercentage } from "@/lib/layoutSketch";
import { PercentageField } from "./SketchFields";
import { confirmOrCancelStringEdit } from "./editorInput";

export function SketchProperties({
  selected,
  nameInputRef,
  onRename,
  onGeometryChange,
  onCenterChange,
  onGridChange,
  pendingGridUpdate,
  onConfirmGridUpdate,
  onCancelGridUpdate,
  onRotationChange,
  onShadowChange,
  resolveExpression,
}: {
  selected: SketchNode;
  nameInputRef: RefObject<HTMLInputElement | null>;
  onRename: (value: string, input: HTMLInputElement) => void;
  onGeometryChange: (key: "x" | "y" | "w" | "h", value: SketchPercentage) => void;
  onCenterChange: (key: "centerX" | "centerY", value: SketchPercentage) => void;
  onGridChange: (value: string, input: HTMLInputElement) => void;
  pendingGridUpdate?: { previousCellCount: number; nextCellCount: number } | undefined;
  onConfirmGridUpdate: () => void;
  onCancelGridUpdate: () => void;
  onRotationChange: (value: RotationDeg) => void;
  onShadowChange: (shadow: boolean) => void;
  resolveExpression: (raw: string, minimum: number) => SketchPercentage | undefined;
}) {
  return (
    <aside
      data-testid="layout-properties-panel"
      className="layout-lab-scrollbar col-start-1 row-start-2 overflow-x-auto overflow-y-scroll border-r border-slate-700 bg-slate-900 p-3 [scrollbar-gutter:stable]"
    >
      <h2 className="mb-2 font-semibold">Properties</h2>
      {selected.kind === "gridCell" && (
        <section className="grid gap-1">
          <div className="grid gap-1">
            <label className="grid grid-cols-[1fr_6.5rem] items-center gap-2 text-sm">
              <span>Name</span>
              <input
                aria-label="Name"
                className="min-w-0 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                readOnly
                value={selected.name}
              />
            </label>
            <label className="grid grid-cols-[1fr_6.5rem] items-center gap-2 text-sm">
              <span>Shadow</span>
              <input
                aria-label="Shadow"
                className="h-4 w-4 justify-self-start accent-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                type="checkbox"
                checked={selected.shadow ?? true}
                disabled={selected.children.length > 0}
                title={
                  selected.children.length > 0 ? "Remove child objects to modify Shadow" : undefined
                }
                onChange={(event) => onShadowChange(event.currentTarget.checked)}
              />
            </label>
            {[
              [
                "Center X",
                selected.centerX?.raw ?? String(selected.x.resolved + selected.w.resolved / 2),
              ],
              [
                "Center Y",
                selected.centerY?.raw ?? String(selected.y.resolved + selected.h.resolved / 2),
              ],
              ["W", selected.w.raw],
              ["H", selected.h.raw],
            ].map(([label, value]) => (
              <label key={label} className="grid grid-cols-[1fr_6.5rem] items-center gap-2 text-sm">
                <span>{label}</span>
                <input
                  aria-label={label}
                  className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-slate-100"
                  readOnly
                  value={value}
                />
              </label>
            ))}
          </div>
        </section>
      )}
      {selected.name !== "viewport" && selected.kind !== "gridCell" && (
        <>
          <label className="grid grid-cols-[1fr_6.5rem] items-center gap-2 text-sm">
            <span>Name</span>
            <input
              key={selected.name}
              ref={nameInputRef}
              aria-label="Name"
              className="min-w-0 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
              defaultValue={selected.name}
              onBlur={(event) => onRename(event.target.value, event.currentTarget)}
              onKeyDown={(event) => confirmOrCancelStringEdit(event, selected.name)}
            />
          </label>
          <div className="mt-2 grid gap-1">
            {(
              [
                ["centerX", "Center X"],
                ["centerY", "Center Y"],
                ["w", "W"],
                ["h", "H"],
              ] as const
            ).map(([key, label]) => (
              <PercentageField
                key={key}
                label={label}
                value={
                  key === "centerX"
                    ? (selected.centerX ?? {
                        raw: String(selected.x.resolved + selected.w.resolved / 2),
                        resolved: selected.x.resolved + selected.w.resolved / 2,
                      })
                    : key === "centerY"
                      ? (selected.centerY ?? {
                          raw: String(selected.y.resolved + selected.h.resolved / 2),
                          resolved: selected.y.resolved + selected.h.resolved / 2,
                        })
                      : selected[key]
                }
                minimum={key === "w" || key === "h" ? 0.1 : 0}
                resolve={resolveExpression}
                onChange={(value) =>
                  key === "centerX" || key === "centerY"
                    ? onCenterChange(key, value)
                    : onGeometryChange(key, value)
                }
              />
            ))}
          </div>
          <label className="mt-2 grid grid-cols-[1fr_6.5rem] items-center gap-2 text-sm">
            <span>Rotation</span>
            <select
              aria-label="Rotation"
              className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-slate-100"
              value={selected.rotationDeg ?? 0}
              onChange={(event) => onRotationChange(Number(event.target.value) as RotationDeg)}
            >
              {[0, 90, 180, -90].map((value) => (
                <option key={value} value={value}>
                  {value}°
                </option>
              ))}
            </select>
          </label>
          {selected.kind === "grid" && (
            <label className="mt-2 grid gap-1 text-sm">
              <span>Grid (columns)(rows), * fills remaining</span>
              <input
                key={selected.grid!.raw}
                aria-label="Grid template"
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-slate-100"
                defaultValue={selected.grid!.raw}
                onBlur={(event) => onGridChange(event.currentTarget.value, event.currentTarget)}
                onKeyDown={(event) => confirmOrCancelStringEdit(event, selected.grid!.raw)}
              />
            </label>
          )}
        </>
      )}
      {pendingGridUpdate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Confirm grid update"
            className="w-full max-w-sm rounded border border-slate-600 bg-slate-900 p-4 shadow-xl"
          >
            <h2 className="font-semibold text-slate-100">Update grid?</h2>
            <p className="mt-2 text-sm text-slate-300">
              Grid cells will change from {pendingGridUpdate.previousCellCount} to{" "}
              {pendingGridUpdate.nextCellCount}.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
                onClick={onCancelGridUpdate}
              >
                Cancel
              </button>
              <button
                className="rounded bg-amber-500 px-3 py-1 text-sm font-medium text-slate-950 hover:bg-amber-400"
                onClick={onConfirmGridUpdate}
              >
                Apply
              </button>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
