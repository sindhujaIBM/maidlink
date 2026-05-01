export const SQFT_PRESETS = [
  { label: '< 500',       value: 400  },
  { label: '500–1,000',   value: 750  },
  { label: '1,000–1,500', value: 1250 },
  { label: '1,500–2,000', value: 1750 },
  { label: '2,000–2,500', value: 2250 },
  { label: '2,500+',      value: 3000 },
];

export const snapSqft = (v: number) =>
  SQFT_PRESETS.reduce((best, p) => Math.abs(p.value - v) < Math.abs(best.value - v) ? p : best).value;

export function Stepper({ label, value, min, max, step = 1, onChange }: {
  label?: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  const fmt = (v: number) => step === 0.5 && v % 1 !== 0 ? v.toFixed(1) : String(v);
  return (
    <div>
      {label && <label className="label mb-1">{label}</label>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          disabled={value <= min}
          className="h-9 w-9 rounded-full border border-gray-300 text-lg font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30">−</button>
        <span className="w-16 text-center font-semibold text-gray-900 text-lg">{fmt(value)}</span>
        <button type="button" onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}
          disabled={value >= max}
          className="h-9 w-9 rounded-full border border-gray-300 text-lg font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30">+</button>
      </div>
    </div>
  );
}

export function ChipGroup<T extends string>({ label, options, value, onChange }: {
  label?: string; options: readonly T[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div>
      {label && <label className="label mb-2">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              value === opt
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
            }`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
