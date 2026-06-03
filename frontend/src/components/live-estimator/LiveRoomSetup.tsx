import { useState } from 'react';

const CLEANING_TYPES = ['Standard Cleaning', 'Deep Cleaning', 'Move-Out/Move-In Cleaning'];
const SQFT_RANGES    = ['Under 500', '500-1000', '1000-1500', '1500-2000', '2000-2500', '2500+'];

function sqftToRange(sqft: number): string {
  if (sqft < 500)  return 'Under 500';
  if (sqft < 1000) return '500-1000';
  if (sqft < 1500) return '1000-1500';
  if (sqft < 2000) return '1500-2000';
  if (sqft < 2500) return '2000-2500';
  return '2500+';
}

function readPrefill() {
  try {
    const s = JSON.parse(sessionStorage.getItem('estimator_form_state') ?? 'null');
    if (!s) return null;
    return {
      bedrooms:     typeof s.bedrooms     === 'number' ? s.bedrooms     : 2,
      bathrooms:    typeof s.bathrooms    === 'number' ? s.bathrooms    : 1,
      sqftRange:    typeof s.sqft         === 'number' ? sqftToRange(s.sqft) : '1000-1500',
      cleaningType: typeof s.cleaningType === 'string' ? s.cleaningType : 'Standard Cleaning',
    };
  } catch { return null; }
}

interface HomeDetails {
  rooms:        string[];
  cleaningType: string;
  bedrooms:     number;
  bathrooms:    number;
  sqftRange:    string;
}

interface Props {
  onStart:   (details: HomeDetails) => void;
  onUnlock?: () => void;
}

export function LiveRoomSetup({ onStart, onUnlock }: Props) {
  const prefill = readPrefill();

  const [bedrooms,     setBedrooms]     = useState(prefill?.bedrooms     ?? 2);
  const [bathrooms,    setBathrooms]    = useState(prefill?.bathrooms    ?? 1);
  const [sqftRange,    setSqftRange]    = useState(prefill?.sqftRange    ?? '1000-1500');
  const [cleaningType, setCleaningType] = useState(prefill?.cleaningType ?? 'Standard Cleaning');
  const [extraRooms,   setExtraRooms]   = useState<string[]>([]);

  const baseRooms = [
    ...Array.from({ length: bedrooms },  (_, i) => bedrooms  === 1 ? 'Bedroom'   : `Bedroom ${i + 1}`),
    ...Array.from({ length: bathrooms }, (_, i) => bathrooms === 1 ? 'Bathroom'  : `Bathroom ${i + 1}`),
    'Living Room',
    'Kitchen',
  ];

  const toggleExtra = (room: string) =>
    setExtraRooms(prev => prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]);

  const allRooms = [...baseRooms, ...extraRooms];

  const stepper = (value: number, set: (v: number) => void, min: number, max: number) => (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => set(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg bg-amber-50 text-gray-700 flex items-center justify-center hover:bg-stone-100 transition-colors disabled:opacity-40"
        disabled={value <= min}
      >−</button>
      <span className="w-4 text-center font-medium text-gray-900">{value}</span>
      <button
        type="button"
        onClick={() => set(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg bg-amber-50 text-gray-700 flex items-center justify-center hover:bg-stone-100 transition-colors disabled:opacity-40"
        disabled={value >= max}
      >+</button>
    </div>
  );

  const handleStart = () => {
    onUnlock?.();
    onStart({ rooms: allRooms, cleaningType, bedrooms, bathrooms, sqftRange });
  };

  return (
    <div className="max-w-lg mx-auto space-y-4 pt-4">
      {prefill && (
        <p className="text-xs text-teal-600 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
          Pre-filled from your estimator — adjust if needed
        </p>
      )}

      {/* Bedrooms / Bathrooms */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Bedrooms</span>
          {stepper(bedrooms, setBedrooms, 1, 6)}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Bathrooms</span>
          {stepper(bathrooms, setBathrooms, 1, 5)}
        </div>
      </div>

      {/* Sqft */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-medium text-gray-700 mb-3">Home size (sqft)</p>
        <div className="grid grid-cols-3 gap-2">
          {SQFT_RANGES.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setSqftRange(r)}
              className={`text-xs py-2 px-2 rounded-lg border transition-colors ${
                sqftRange === r
                  ? 'border-teal-600 bg-teal-50 text-teal-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >{r}</button>
          ))}
        </div>
      </div>

      {/* Cleaning type */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-medium text-gray-700 mb-3">Cleaning type</p>
        <div className="space-y-2">
          {CLEANING_TYPES.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setCleaningType(t)}
              className={`w-full text-left text-sm py-2.5 px-4 rounded-lg border transition-colors ${
                cleaningType === t
                  ? 'border-teal-600 bg-teal-50 text-teal-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* Extra rooms */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-medium text-gray-700 mb-3">Additional spaces <span className="text-gray-400 font-normal">(optional)</span></p>
        <div className="flex flex-wrap gap-2">
          {['Basement', 'Garage', 'Laundry Room', 'Office', 'Dining Room'].map(r => (
            <button
              key={r}
              type="button"
              onClick={() => toggleExtra(r)}
              className={`text-xs py-1.5 px-3 rounded-full border transition-colors ${
                extraRooms.includes(r)
                  ? 'border-teal-600 bg-teal-50 text-teal-700 font-medium'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >{r}</button>
          ))}
        </div>
      </div>

      {/* Room preview */}
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Rooms in this walkthrough</p>
        <div className="flex flex-wrap gap-1.5">
          {allRooms.map(r => (
            <span key={r} className="text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-1 rounded-full">{r}</span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleStart}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
      >
        Start Live Walkthrough
      </button>
    </div>
  );
}
