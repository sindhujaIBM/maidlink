import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../contexts/AuthContext';
import { buildGoogleAuthUrl } from '../../api/auth';
import {
  getEstimatorPhotoUploadUrl,
  uploadEstimatorPhotoToS3,
  analyzeEstimatorPhotos,
  type EstimatorAnalysisResult,
} from '../../api/estimator';

// ── Types & constants ─────────────────────────────────────────────────────────

type CleaningType    = 'Standard Cleaning' | 'Deep Cleaning' | 'Move-Out/Move-In Cleaning';
type HouseCondition  = 'Normal' | 'Moderately Dirty' | 'Heavily Soiled';
type CookingFreq     = 'Rarely' | 'Occasionally' | 'Frequently';
type CookingStyle    = 'Light' | 'Moderate' | 'Heavy';

const CLEANING_TYPES: CleaningType[] = ['Standard Cleaning', 'Deep Cleaning', 'Move-Out/Move-In Cleaning'];
const HOUSE_CONDITIONS: HouseCondition[] = ['Normal', 'Moderately Dirty', 'Heavily Soiled'];
const COOKING_FREQS: CookingFreq[] = ['Rarely', 'Occasionally', 'Frequently'];
const COOKING_STYLES: CookingStyle[] = ['Light', 'Moderate', 'Heavy'];

const EXTRAS = [
  { id: 'oven',         label: 'Inside Oven',     hours: 1    },
  { id: 'refrigerator', label: 'Inside Fridge',   hours: 0.5  },
  { id: 'windows',      label: 'Windows',         hours: 1    },
  { id: 'basement',     label: 'Basement',        hours: 1    },
  { id: 'laundry',      label: 'Laundry (1 load)',hours: 0.5  },
  { id: 'garage',       label: 'Garage',          hours: 0.75 },
];

const EXTRA_MINS: Record<number, string> = { 1: '60', 0.5: '30', 0.75: '45' };

// ── Calculation ───────────────────────────────────────────────────────────────

function calcHours(
  bedrooms: number,
  bathrooms: number,
  sqft: number,
  cleaningType: CleaningType,
  houseCondition: HouseCondition,
  pets: boolean,
  cookingFreq: CookingFreq,
  cookingStyle: CookingStyle,
  extras: string[],
) {
  const isMoveOut = cleaningType === 'Move-Out/Move-In Cleaning';

  let base = bedrooms * 0.5 + bathrooms * 0.75 + (sqft / 500);

  if (!isMoveOut) {
    if (extras.includes('basement')) base += 1;
    if (extras.includes('laundry'))  base += 0.5;
    if (extras.includes('garage'))   base += 0.75;
  }

  if (cleaningType === 'Deep Cleaning')          base *= 1.5;
  if (isMoveOut)                                 base *= 2;

  if (houseCondition === 'Moderately Dirty')     base *= 1.25;
  if (houseCondition === 'Heavily Soiled')       base *= 1.5;

  if (pets)                        base += 0.5;
  if (cookingFreq === 'Frequently') base += 1;
  if (cookingStyle === 'Heavy')     base += 1;

  if (!isMoveOut) {
    if (extras.includes('oven'))         base += 1;
    if (extras.includes('refrigerator')) base += 0.5;
    if (extras.includes('windows'))      base += 1;
  }

  const round = (n: number) => n <= 4 ? Math.ceil(n * 2) / 2 : Math.ceil(n);
  return { one: round(base), two: round(base / 2) };
}

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  const fmt = (v: number) => step === 0.5 && v % 1 !== 0 ? v.toFixed(1) : String(v);
  return (
    <div>
      <label className="label mb-1">{label}</label>
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

// ── ChipGroup ─────────────────────────────────────────────────────────────────

function ChipGroup<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly T[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div>
      <label className="label mb-2">{label}</label>
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

// ── Widget ────────────────────────────────────────────────────────────────────

export function EstimatorWidget() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [bedrooms,      setBedrooms]      = useState(2);
  const [bathrooms,     setBathrooms]     = useState(1);
  const [sqft,          setSqft]          = useState(1000);
  const [cleaningType,  setCleaningType]  = useState<CleaningType>('Standard Cleaning');
  const [houseCondition,setHouseCondition]= useState<HouseCondition>('Normal');
  const [pets,          setPets]          = useState(false);
  const [cookingFreq,   setCookingFreq]   = useState<CookingFreq>('Occasionally');
  const [cookingStyle,  setCookingStyle]  = useState<CookingStyle>('Moderate');
  const [extras,        setExtras]        = useState<string[]>([]);

  const [photos,       setPhotos]       = useState<Array<{ file: File; preview: string; s3Key: string | null }>>([]);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState<string | null>(null);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [aiResult,     setAiResult]     = useState<EstimatorAnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-select all extras for Move-Out/Move-In; clear when switching away
  useEffect(() => {
    if (cleaningType === 'Move-Out/Move-In Cleaning') {
      setExtras(EXTRAS.map(e => e.id));
    } else {
      setExtras([]);
    }
  }, [cleaningType]);

  const { one, two } = calcHours(
    bedrooms, bathrooms, sqft, cleaningType, houseCondition,
    pets, cookingFreq, cookingStyle, extras,
  );

  function toggleExtra(id: string) {
    setExtras(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  }

  async function handlePhotosSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = 5 - photos.length;
    const toAdd = files.slice(0, remaining);

    setUploadError(null);
    setUploading(true);

    const newEntries: typeof photos = [];
    for (const file of toAdd) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) { setUploadError('Each photo must be under 10 MB'); continue; }
      newEntries.push({ file, preview: URL.createObjectURL(file), s3Key: null });
    }

    const startIndex = photos.length;
    setPhotos(prev => [...prev, ...newEntries]);

    const results = await Promise.allSettled(
      newEntries.map(async (_, i) => {
        const { uploadUrl, s3Key } = await getEstimatorPhotoUploadUrl();
        await uploadEstimatorPhotoToS3(uploadUrl, newEntries[i].file);
        return { i, s3Key };
      })
    );

    setPhotos(prev => {
      const updated = [...prev];
      results.forEach((res) => {
        if (res.status === 'fulfilled') {
          updated[startIndex + res.value.i] = { ...updated[startIndex + res.value.i], s3Key: res.value.s3Key };
        }
      });
      return updated;
    });

    const failures = results.filter(r => r.status === 'rejected').length;
    if (failures > 0) setUploadError(`${failures} photo(s) failed to upload.`);

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setAiResult(null);
  }

  async function handleAnalyze() {
    const readyKeys = photos.map(p => p.s3Key).filter(Boolean) as string[];
    if (!readyKeys.length) return;

    setAnalyzeError(null);
    setAnalyzing(true);
    setAiResult(null);
    try {
      const result = await analyzeEstimatorPhotos({
        bedrooms,
        bathrooms,
        sqftRange:    sqft < 500 ? '<500' : sqft <= 1000 ? '500-1000' : sqft <= 1500 ? '1000-1500' : sqft <= 2000 ? '1500-2000' : sqft <= 2500 ? '2000-2500' : '2500+',
        condition:    houseCondition === 'Normal' ? 'average' : houseCondition === 'Moderately Dirty' ? 'messy' : 'very_messy',
        extras,
        photoS3Keys:  readyKeys,
        cleaningType,
        pets,
        cookingFreq,
        cookingStyle,
      });
      setAiResult(result);
    } catch {
      setAnalyzeError('Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  const readyCount   = photos.filter(p => p.s3Key !== null).length;
  const isMoveOut    = cleaningType === 'Move-Out/Move-In Cleaning';
  const readyS3Keys  = photos.map(p => p.s3Key).filter(Boolean) as string[];

  function handleBookNow() {
    // Store estimator photo keys so the booking flow can link them to the booking
    if (readyS3Keys.length > 0) {
      sessionStorage.setItem('estimatorPhotoKeys', JSON.stringify(readyS3Keys));
    } else {
      sessionStorage.removeItem('estimatorPhotoKeys');
    }
    navigate('/maids');
  }

  const CONDITION_LABELS: Record<string, string> = {
    pristine: 'Pristine', average: 'Average', messy: 'Messy', very_messy: 'Very Messy',
    Normal: 'Normal', 'Moderately Dirty': 'Moderately Dirty', 'Heavily Soiled': 'Heavily Soiled',
  };

  return (
    <div className="space-y-5">

      {/* Bedrooms + Bathrooms */}
      <div className="card grid grid-cols-2 gap-6">
        <Stepper label="Bedrooms"  value={bedrooms}  min={0} max={8} onChange={setBedrooms} />
        <Stepper label="Bathrooms" value={bathrooms} min={0} max={6} step={0.5} onChange={setBathrooms} />
      </div>

      {/* Square Footage */}
      <div className="card">
        <Stepper label="Square Footage" value={sqft} min={0} max={5000} step={100} onChange={setSqft} />
        <p className="text-xs text-gray-400 mt-2">Adjust in 100 sq ft increments</p>
      </div>

      {/* Cleaning Type */}
      <div className="card">
        <ChipGroup label="Cleaning Type" options={CLEANING_TYPES} value={cleaningType} onChange={setCleaningType} />
      </div>

      {/* House Condition */}
      <div className="card">
        <ChipGroup label="House Condition" options={HOUSE_CONDITIONS} value={houseCondition} onChange={setHouseCondition} />
      </div>

      {/* Pets */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="label">Pets</p>
          <p className="text-xs text-gray-400 mt-0.5">Adds 30 min for pet hair</p>
        </div>
        <button type="button" onClick={() => setPets(p => !p)}
          className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
            pets ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
          }`}>
          {pets ? 'Yes' : 'No'}
        </button>
      </div>

      {/* Cooking Frequency + Style */}
      <div className="card space-y-4">
        <ChipGroup label="Cooking Frequency" options={COOKING_FREQS} value={cookingFreq} onChange={setCookingFreq} />
        <ChipGroup label="Cooking Style"     options={COOKING_STYLES} value={cookingStyle} onChange={setCookingStyle} />
      </div>

      {/* Additional Tasks */}
      {!isMoveOut && (
        <div className="card">
          <label className="label mb-2">Additional Tasks</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {EXTRAS.map(e => (
              <button key={e.id} type="button" onClick={() => toggleExtra(e.id)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  extras.includes(e.id)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
                }`}>
                {e.label}
                <span className={`block text-xs mt-0.5 ${extras.includes(e.id) ? 'text-brand-100' : 'text-gray-400'}`}>
                  +{EXTRA_MINS[e.hours]} min
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isMoveOut && (
        <div className="card bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-800 font-medium">Move-Out/Move-In includes all add-ons</p>
          <p className="text-xs text-amber-600 mt-0.5">Oven, fridge, windows, basement, laundry & garage are all included.</p>
        </div>
      )}

      {/* Base estimate */}
      <div className="card bg-brand-700 text-white">
        <h2 className="text-sm font-medium text-brand-200 mb-3">
          {aiResult ? 'Base Estimate (form inputs only)' : 'Estimated Cleaning Time'}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-brand-600 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold">{one} hrs</div>
            <div className="text-brand-200 text-sm mt-1">1 Cleaner</div>
          </div>
          <div className="bg-brand-600 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold">{two} hrs</div>
            <div className="text-brand-200 text-sm mt-1">2 Cleaners</div>
          </div>
        </div>
        <p className="text-xs text-brand-300 mt-3 text-center">
          Estimates are approximate. Actual times may vary.
        </p>
      </div>

      {/* Book a cleaner CTA */}
      <button
        type="button"
        onClick={handleBookNow}
        className="btn-primary w-full text-base py-3"
      >
        Book a cleaner
      </button>

      {/* AI result */}
      {aiResult && (
        <div className="card border-2 border-brand-400 bg-brand-50">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">✨</span>
            <h2 className="font-semibold text-brand-800">AI-Enhanced Estimate</h2>
            {!aiResult.matchesSelfReport && (
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                Condition adjusted
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-brand-600 rounded-xl p-3 text-center text-white">
              <div className="text-2xl font-bold">{aiResult.oneCleanerHours} hrs</div>
              <div className="text-brand-200 text-xs mt-0.5">1 Cleaner (AI)</div>
            </div>
            <div className="bg-brand-600 rounded-xl p-3 text-center text-white">
              <div className="text-2xl font-bold">{aiResult.twoCleanerHours} hrs</div>
              <div className="text-brand-200 text-xs mt-0.5">2 Cleaners (AI)</div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Detected condition</span>
              <p className="font-medium text-gray-800 mt-0.5">
                {CONDITION_LABELS[aiResult.adjustedCondition] ?? aiResult.adjustedCondition}
                {!aiResult.matchesSelfReport && (
                  <span className="text-amber-600 text-xs ml-1">
                    (you reported: {houseCondition})
                  </span>
                )}
              </p>
            </div>

            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">What we observed</span>
              <p className="text-gray-700 mt-0.5">{aiResult.conditionAssessment}</p>
            </div>

            {aiResult.cleaningTypeNote && (
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cleaning type</span>
                <p className="text-gray-700 mt-0.5">{aiResult.cleaningTypeNote}</p>
              </div>
            )}

            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Areas needing most attention</span>
              <ul className="mt-1 space-y-1">
                {aiResult.keyAreas.map((area, i) => (
                  <li key={i} className="text-gray-700 flex gap-1.5">
                    <span className="text-brand-500 mt-0.5">•</span>{area}
                  </li>
                ))}
              </ul>
            </div>

            {aiResult.confidenceNote && (
              <p className="text-xs text-gray-400 italic border-t pt-2">{aiResult.confidenceNote}</p>
            )}
          </div>
        </div>
      )}

      {/* AI photo upload */}
      <div className="card">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl leading-none">✨</span>
          <div>
            <h3 className="font-semibold text-gray-800">Get a smarter estimate with AI</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload photos of your rooms and our AI will analyse the actual condition for a more accurate result.
            </p>
          </div>
        </div>

        {!isAuthenticated ? (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-center">
            <p className="text-sm text-gray-600 mb-3">Sign in to unlock AI photo analysis.</p>
            <button
              onClick={() => { window.location.href = buildGoogleAuthUrl(); }}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 shadow-sm text-gray-700 font-medium text-sm transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        ) : (
          <>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {photos.map((p, i) => (
                  <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    <img src={p.preview} alt={`Room ${i + 1}`} className="h-full w-full object-cover" />
                    {p.s3Key === null && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Spinner size="sm" />
                      </div>
                    )}
                    {p.s3Key !== null && (
                      <button onClick={() => removePhoto(i)}
                        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-600">
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {photos.length < 5 && (
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="h-20 w-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors flex-shrink-0 text-2xl">
                    +
                  </button>
                )}
              </div>
            )}

            {photos.length === 0 && (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-brand-400 transition-colors disabled:opacity-50">
                <p className="text-sm font-medium text-gray-600">Click to upload room photos</p>
                <p className="text-xs text-gray-400 mt-1">JPEG or PNG · max 10 MB each · up to 5 photos</p>
              </button>
            )}

            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png"
              multiple onChange={handlePhotosSelected} className="hidden" />

            {uploadError  && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}
            {analyzeError && <p className="text-xs text-red-600 mt-2">{analyzeError}</p>}

            {readyCount > 0 && (
              <button type="button" onClick={handleAnalyze} disabled={analyzing || uploading}
                className="mt-3 btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2">
                {analyzing ? <><Spinner size="sm" /> Analysing…</> : `Analyse ${readyCount} photo${readyCount > 1 ? 's' : ''} with AI`}
              </button>
            )}

            {analyzing && (
              <p className="text-xs text-gray-400 text-center mt-2">This usually takes 10–25 seconds…</p>
            )}
          </>
        )}
      </div>

    </div>
  );
}
