import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowUpDown, GripVertical, Plus, Search, Trash2 } from "lucide-react";
import { type SketchVariable } from "@/features/layout-sketch/lib/layoutSketch";
import { useDragSort } from "@/features/layout-sketch/hooks/useDragSort";
import { useVariableAutocomplete } from "@/features/layout-sketch/hooks/useVariableAutocomplete";
import { AutocompleteDropdown } from "./SketchFields";

const SORT_GROUP = "variables";

type Sort = ReturnType<typeof useDragSort>;

function VariableRow({
  variable,
  index,
  isEditing,
  nameInputRef,
  sort,
  variableNames,
  onUpdate,
  onRemove,
  onStartEditing,
  isUsed,
}: {
  variable: SketchVariable;
  index: number;
  isEditing: boolean;
  nameInputRef: RefObject<HTMLInputElement | null>;
  sort: Sort;
  variableNames: readonly string[];
  onUpdate: (name: string, key: "name" | "value", value: string) => boolean | undefined;
  onRemove: (name: string) => boolean;
  onStartEditing: () => void;
  isUsed: (name: string) => boolean;
}) {
  const valueInputRef = useRef<HTMLInputElement>(null);
  const autocomplete = useVariableAutocomplete(variableNames);
  const isDropTarget = sort.dropName === variable.name;
  const rowClassName = `grid items-center gap-1 ${sort.active ? "grid-cols-[1fr_auto]" : "grid-cols-[1fr_1fr_auto]"} ${sort.draggingName === variable.name ? "opacity-40" : ""} ${isDropTarget && sort.dropBefore ? "border-t-2 border-amber-400" : ""} ${isDropTarget && !sort.dropBefore ? "border-b-2 border-amber-400" : ""}`;

  if (sort.active) {
    return (
      <div {...sort.dropTargetProps(variable.name, SORT_GROUP)} className={rowClassName}>
        <span
          aria-label={`Variable name ${index + 1}`}
          // border-transparent matches the non-sort-mode name button's box
          // model (see below) so row height doesn't shrink by the border
          // width when toggling sort mode.
          className="min-w-0 truncate rounded border border-transparent px-2 py-1 text-sm"
        >
          {variable.name}
        </span>
        <button
          aria-label={`Reorder variable ${variable.name}`}
          className="cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white active:cursor-grabbing"
          onPointerDown={sort.startDrag(variable.name, SORT_GROUP)}
          onPointerMove={sort.onDragPointerMove}
        >
          <GripVertical size={15} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div {...sort.dropTargetProps(variable.name, SORT_GROUP)} className={rowClassName}>
      {isEditing ? (
        <input
          ref={nameInputRef}
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
      ) : (
        <button
          type="button"
          aria-label={`Variable name ${index + 1}`}
          title="Double-click to rename"
          className="min-w-0 truncate rounded border border-transparent px-2 py-1 text-left text-sm hover:border-slate-600 hover:bg-slate-800"
          onDoubleClick={onStartEditing}
        >
          {variable.name}
        </button>
      )}
      <div className="relative">
        <input
          ref={valueInputRef}
          key={`value-${variable.name}-${variable.value}`}
          aria-label={`Variable value ${variable.name}`}
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-sm"
          defaultValue={variable.value}
          onInput={autocomplete.onInput}
          onBlur={(event) => {
            if (!onUpdate(variable.name, "value", event.currentTarget.value))
              event.currentTarget.value = variable.value;
          }}
          onKeyDown={(event) => {
            if (autocomplete.onKeyDown(event)) {
              event.preventDefault();
              return;
            }
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = variable.value;
              event.currentTarget.blur();
            }
          }}
        />
        {autocomplete.open && (
          <AutocompleteDropdown
            candidates={autocomplete.candidates}
            selectedIndex={autocomplete.selectedIndex}
            onSelect={(optionIndex) => {
              if (valueInputRef.current) autocomplete.select(valueInputRef.current, optionIndex);
            }}
          />
        )}
      </div>
      <button
        aria-label={`Delete variable ${variable.name}`}
        className="rounded p-1 text-slate-400 hover:bg-slate-700 enabled:hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isUsed(variable.name)}
        title={isUsed(variable.name) ? "Remove references before deleting" : "Delete variable"}
        onClick={() => onRemove(variable.name)}
      >
        <Trash2 size={15} aria-hidden />
      </button>
    </div>
  );
}

export function SketchVariables({
  variables,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  isUsed,
  variableNames,
}: {
  variables: SketchVariable[];
  onAdd: () => void;
  onUpdate: (name: string, key: "name" | "value", value: string) => boolean | undefined;
  onRemove: (name: string) => boolean;
  onReorder: (name: string, newIndex: number) => void;
  isUsed: (name: string) => boolean;
  variableNames: readonly string[];
}) {
  const [query, setQuery] = useState("");
  // Which variable's name field is in edit mode, keyed by its name at the
  // moment editing started (onUpdate is itself keyed the same way) — names
  // double as identity here, same as everywhere else in the Lab.
  const [editingName, setEditingName] = useState<string>();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const previousCount = useRef(variables.length);
  const panelRef = useRef<HTMLElement>(null);
  const sort = useDragSort({ containerRef: panelRef, onReorder });

  useEffect(() => {
    // A newly added variable always lands at the end of the array (see
    // addVariable) — only fires on a genuine addition, not on every edit
    // (renames/value changes replace the array too, but keep its length).
    if (variables.length > previousCount.current) {
      setEditingName(variables[variables.length - 1]?.name);
    }
    previousCount.current = variables.length;
  }, [variables]);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? variables.filter((variable) => variable.name.toLowerCase().includes(normalizedQuery))
    : variables;

  return (
    <aside
      ref={panelRef}
      data-testid="layout-variables-panel"
      className="layout-lab-scrollbar col-start-3 row-start-1 row-span-2 overflow-x-auto overflow-y-scroll border-l border-slate-700 bg-slate-900 p-3 scrollbar-gutter-stable"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Variables</h2>
        <div className="flex gap-1">
          {variables.length > 1 && (
            <button
              aria-label={sort.active ? "Stop sorting variables" : "Sort variables"}
              aria-pressed={sort.active}
              className={`rounded p-1 hover:bg-slate-700 hover:text-white ${sort.active ? "bg-amber-400 text-slate-950 hover:bg-amber-300 hover:text-slate-950" : "text-slate-300"}`}
              onClick={() => sort.setActive(!sort.active)}
            >
              <ArrowUpDown size={15} aria-hidden />
            </button>
          )}
          {!sort.active && (
            <button
              aria-label="Add variable"
              className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
              onClick={onAdd}
            >
              <Plus size={15} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {variables.length > 0 && (
        <div className="relative mb-2">
          <Search
            size={13}
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            aria-label="Search variables"
            placeholder="Search variables"
            disabled={sort.active}
            className="w-full rounded border border-slate-600 bg-slate-800 py-1 pl-7 pr-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}
      <div
        className="grid gap-1"
        onPointerUp={() => sort.endDrag(variables.map((item) => item.name))}
      >
        {filtered.map((variable, index) => (
          <VariableRow
            key={variable.name}
            variable={variable}
            index={index}
            isEditing={editingName === variable.name}
            nameInputRef={nameInputRef}
            sort={sort}
            variableNames={variableNames}
            onUpdate={(name, key, value) => {
              const ok = onUpdate(name, key, value);
              if (ok && key === "name") setEditingName(undefined);
              return ok;
            }}
            onRemove={onRemove}
            onStartEditing={() => setEditingName(variable.name)}
            isUsed={isUsed}
          />
        ))}
      </div>
      {variables.length === 0 && (
        <p className="text-sm text-slate-400">Add a variable to use it as $name.</p>
      )}
      {variables.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-slate-400">No variables match &ldquo;{query}&rdquo;.</p>
      )}
    </aside>
  );
}
