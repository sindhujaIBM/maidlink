import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../contexts/AuthContext';
import {
  getEstimatorPhotoUploadUrl,
  uploadEstimatorPhotoToS3,
  analyzeEstimatorPhotos,
  type EstimatorAnalysisResult,
} from '../api/estimator';

// ── Types & constants ─────────────────────────────────────────────────────────

type Condition  = 'pristine' | 'average' | 'messy' | 'very_messy';
type SqftRange  = '<500' | '500-1000' | '1000-1500' | '1500-2000' | '2000-2500' | '2500+';

const SQFT_LABELS: Record<SqftRange, string> = {
  '<500':      'Under 500 sq ft',
  '500-1000':  '500 – 1,000 sq ft',
  '1000-1500': '1,000 – 1,500 sq ft',
  '1500-2000': '1,500 – 2,000 sq ft',
  '2000-2500': '2,000 – 2,500 sq ft',
  '2500+':     'Over 2,500 sq ft',
};

const SQFT_FACTOR: Record<SqftRange, number> = {
  '<500': 0, '500-1000': 0.5, '1000-1500': 1.0,
  '1500-2000': 1.5, '2000-2500': 2.0, '2500+': 2.5,
};

const CONDITION_LABELS: Record<Condition, string> = {
  pristine: 'Pristine', average: 'Average', messy: 'Messy', very_messy: 'Very Messy',
};

const CONDITION_MULTIPLIER: Record<Condition, number> = {
  pristine: 0.8, average: 1.0, messy: 1.3, very_messy: 1.6,
};

const CONDITION_DESC: Record<Condition, string> = {
  pristine:  'Regularly cleaned, minimal dust/clutter',
  average:   'Cleaned occasionally, some mess',
  messy:     'Noticeable build-up, significant clutter',
  very_messy:'Heavy build-up, lots of clutter throughout',
};

const EXTRAS = [
  { id: 'oven',     label: 'Inside Oven',     hours: 0.75 },
  { id: 'fridge',   label: 'Inside Fridge',   hours: 0.5  },
  { id: 'cabinets', label: 'Inside Cabinets', hours: 1.0  },
  { id: 'laundry',  label: 'Laundry (1 load)',hours: 0.5  },
  { id: 'windows',  label: 'Windows',         hours: 0.75 },
  { id: 'balcony',  label: 'Balcony / Patio', hours: 0.5  },
];

const EXTRA_MINS: Record<number, string> = { 0.75: '45', 0.5: '30', 1.0: '60' };

// ── Calculation ───────────────────────────────────────────────────────────────

function calcHours(b: number, ba: number, sq: SqftRange, c: Condition, ex: string[]) {
  const raw = (1.5 + b * 0.5 + ba * 0.75 + SQFT_FACTOR[sq] +
    EXTRAS.filter(e => ex.includes(e.id)).reduce((s, e) => s + e.hours, 0))
    * CONDITION_MULTIPLIER[c];
  const r = (n: number) => Math.round(n * 2) / 2;
  return { one: r(Math.max(1, raw)), two: r(Math.max(0.5, raw * 0.65)) };
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
        <button type="button" onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}
          disabled={value <= min}
          className="h-9 w-9 rounded-full border border-gray-300 text-lg font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30">−</button>
        <span className="w-10 text-center font-semibold text-gray-900 text-lg">{fmt(value)}</span>
        <button type="button" onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}
          disabled={value >= max}
          className="h-9 w-9 rounded-full border border-gray-300 text-lg font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30">+</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EstimatorPage() {
  const { isAuthenticated } = useAuth();

  // Form state
  const [bedrooms,  setBedrooms]  = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const [sqft,      setSqft]      = useState<SqftRange>('1000-1500');
  const [condition, setCondition] = useState<Condition>('average');
  const [extras,    setExtras]    = useState<string[]>([]);

  // AI photo state
  const [photos,       setPhotos]       = useState<Array<{ file: File; preview: string; s3Key: string | null }>>([]);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState<string | null>(null);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [aiResult,     setAiResult]     = useState<EstimatorAnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { one, two } = calcHours(bedrooms, bathrooms, sqft, condition, extras);

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
        bedrooms, bathrooms, sqftRange: sqft, condition, extras, photoS3Keys: readyKeys,
      });
      setAiResult(result);
    } catch {
      setAnalyzeError('Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  const readyCount = photos.filter(p => p.s3Key !== null).length;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Cleaning Time Estimator</h1>
          <p className="text-gray-500 text-sm mt-1">
            Quickly estimate how long your cleaning will take based on your home details.
          </p>
        </div>

        <div className="space-y-5">

          {/* Bedrooms + Bathrooms */}
          <div className="card grid grid-cols-2 gap-6">
            <Stepper label="Bedrooms"  value={bedrooms}  min={0} max={8} onChange={setBedrooms} />
            <Stepper label="Bathrooms" value={bathrooms} min={0.5} max={6} step={0.5} onChange={setBathrooms} />
          </div>

          {/* Home size */}
          <div className="card">
            <label className="label mb-2">Home Size</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(SQFT_LABELS) as SqftRange[]).map(k => (
                <button key={k} type="button" onClick={() => setSqft(k)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                    sqft === k ? 'bg-brand-600 text-white border-brand-600'
                               : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'}`}>
                  {SQFT_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {/* Condition */}
          <div className="card">
            <label className="label mb-2">Current Condition</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(CONDITION_LABELS) as Condition[]).map(k => (
                <button key={k} type="button" onClick={() => setCondition(k)}
                  className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                    condition === k ? 'bg-brand-600 text-white border-brand-600'
                                   : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'}`}>
                  <div className="font-medium">{CONDITION_LABELS[k]}</div>
                  <div className={`text-xs mt-0.5 ${condition === k ? 'text-brand-100' : 'text-gray-400'}`}>
                    {CONDITION_DESC[k]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Extras */}
          <div className="card">
            <label className="label mb-2">Add-ons</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EXTRAS.map(e => (
                <button key={e.id} type="button" onClick={() => toggleExtra(e.id)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    extras.includes(e.id) ? 'bg-brand-600 text-white border-brand-600'
                                          : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'}`}>
                  {e.label}
                  <span className={`block text-xs mt-0.5 ${extras.includes(e.id) ? 'text-brand-100' : 'text-gray-400'}`}>
                    +{EXTRA_MINS[e.hours]} min
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Base estimate ── */}
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

          {/* ── AI result ── */}
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
                    {CONDITION_LABELS[aiResult.adjustedCondition as Condition] ?? aiResult.adjustedCondition}
                    {!aiResult.matchesSelfReport && (
                      <span className="text-amber-600 text-xs ml-1">
                        (you reported: {CONDITION_LABELS[condition]})
                      </span>
                    )}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">What we observed</span>
                  <p className="text-gray-700 mt-0.5">{aiResult.conditionAssessment}</p>
                </div>

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

          {/* ── AI photo upload ── */}
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
                <Link to="/" className="btn-primary text-sm px-4 py-2">Sign in</Link>
              </div>
            ) : (
              <>
                {/* Thumbnails */}
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
      </div>
    </Layout>
  );
}
