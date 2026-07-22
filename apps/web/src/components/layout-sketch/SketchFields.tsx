import { resolvePercentage, type SketchPercentage } from "@/lib/layoutSketch";

export function PercentageField({
  label,
  value,
  minimum,
  resolve,
  onChange,
}: {
  label: string;
  value: SketchPercentage;
  minimum: number;
  resolve?: (raw: string, minimum: number) => SketchPercentage | undefined;
  onChange: (value: SketchPercentage) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_6.5rem] items-center gap-2 text-sm">
      <span>{label}</span>
      <input
        key={`${label}-${value.raw}`}
        aria-label={label}
        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-slate-100"
        inputMode="decimal"
        defaultValue={value.raw}
        onBlur={(event) => {
          const parsed = (resolve ?? resolvePercentage)(event.currentTarget.value, minimum);
          if (!parsed) event.currentTarget.value = value.raw;
          else onChange(parsed);
        }}
      />
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
