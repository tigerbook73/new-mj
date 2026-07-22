import { Plus, Trash2 } from "lucide-react";
import { type SketchVariable } from "@/lib/layoutSketch";

export function SketchVariables({
  variables,
  onAdd,
  onUpdate,
  onRemove,
  isUsed,
}: {
  variables: SketchVariable[];
  onAdd: () => void;
  onUpdate: (name: string, key: "name" | "value", value: string) => boolean | undefined;
  onRemove: (name: string) => boolean;
  isUsed: (name: string) => boolean;
}) {
  return (
    <aside
      data-testid="layout-variables-panel"
      className="layout-lab-scrollbar col-start-3 row-start-1 row-span-2 overflow-x-auto overflow-y-scroll border-l border-slate-700 bg-slate-900 p-3 [scrollbar-gutter:stable]"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Variables</h2>
        <button
          aria-label="Add variable"
          className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={onAdd}
        >
          <Plus size={15} aria-hidden />
        </button>
      </div>
      <div className="grid gap-1">
        {[...variables]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((variable, index) => (
            <div key={variable.name} className="grid grid-cols-[1fr_1fr_auto] gap-1">
              <input
                key={`name-${variable.name}`}
                aria-label={`Variable name ${index + 1}`}
                className="min-w-0 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                defaultValue={variable.name}
                onBlur={(event) => {
                  if (!onUpdate(variable.name, "name", event.currentTarget.value))
                    event.currentTarget.value = variable.name;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.value = variable.name;
                    event.currentTarget.blur();
                  }
                }}
              />
              <input
                key={`value-${variable.name}-${variable.value}`}
                aria-label={`Variable value ${variable.name}`}
                className="min-w-0 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-sm"
                defaultValue={variable.value}
                onBlur={(event) => {
                  if (!onUpdate(variable.name, "value", event.currentTarget.value))
                    event.currentTarget.value = variable.value;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.value = variable.value;
                    event.currentTarget.blur();
                  }
                }}
              />
              <button
                aria-label={`Delete variable ${variable.name}`}
                className="rounded p-1 text-slate-400 hover:bg-slate-700 enabled:hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={isUsed(variable.name)}
                title={
                  isUsed(variable.name) ? "Remove references before deleting" : "Delete variable"
                }
                onClick={() => onRemove(variable.name)}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          ))}
      </div>
      {variables.length === 0 && (
        <p className="text-sm text-slate-400">Add a variable to use it as $name.</p>
      )}
    </aside>
  );
}
