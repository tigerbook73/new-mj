import { useRef } from "react";
import { resolvePercentage, type SketchPercentage } from "@/features/layout-sketch/lib/layoutSketch";
import { useVariableAutocomplete } from "@/features/layout-sketch/hooks/useVariableAutocomplete";

/** Popup rendered under a raw-expression input while `$partial` autocomplete is open — see useVariableAutocomplete. */
export function AutocompleteDropdown({
  candidates,
  selectedIndex,
  onSelect,
}: {
  candidates: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ul
      role="listbox"
      aria-label="Variable suggestions"
      className="absolute left-0 top-full z-50 mt-1 max-h-40 w-full overflow-y-auto rounded border border-slate-600 bg-slate-800 text-sm shadow-xl"
    >
      {candidates.map((name, index) => (
        <li key={name} role="option" aria-selected={index === selectedIndex}>
          <button
            type="button"
            className={`block w-full px-2 py-1 text-left ${index === selectedIndex ? "bg-amber-400 text-slate-950" : "hover:bg-slate-700"}`}
            // preventDefault keeps focus (and the browser's native selection
            // range) on the input instead of shifting it to this button,
            // which is what lets `select()` still read/write the input's
            // own value+caret.
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(index);
            }}
          >
            ${name}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PercentageField({
  label,
  value,
  minimum,
  resolve,
  onChange,
  variableNames = [],
}: {
  label: string;
  value: SketchPercentage;
  minimum: number;
  resolve?: (raw: string, minimum: number) => SketchPercentage | undefined;
  onChange: (value: SketchPercentage) => void;
  variableNames?: readonly string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocomplete = useVariableAutocomplete(variableNames);
  return (
    <label className="grid grid-cols-[1fr_6.5rem] items-center gap-2 text-sm">
      <span>{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          key={`${label}-${value.raw}`}
          aria-label={label}
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-slate-100"
          inputMode="decimal"
          defaultValue={value.raw}
          onInput={autocomplete.onInput}
          onKeyDown={(event) => {
            if (autocomplete.onKeyDown(event)) event.preventDefault();
          }}
          onBlur={(event) => {
            const parsed = (resolve ?? resolvePercentage)(event.currentTarget.value, minimum);
            if (!parsed) event.currentTarget.value = value.raw;
            else onChange(parsed);
          }}
        />
        {autocomplete.open && (
          <AutocompleteDropdown
            candidates={autocomplete.candidates}
            selectedIndex={autocomplete.selectedIndex}
            onSelect={(index) => {
              if (inputRef.current) autocomplete.select(inputRef.current, index);
            }}
          />
        )}
      </div>
    </label>
  );
}

export function RatioField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_6.5rem] items-center gap-2 text-sm">
      <span>{label}</span>
      <input
        aria-label={label}
        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-slate-100"
        type="number"
        min="1"
        max="32"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
