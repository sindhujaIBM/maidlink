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
import { CLEANING_CHECKLIST, type CleaningTypeKey } from '../../data/cleaningChecklist';
import { CameraCapture } from './CameraCapture';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';

// ── Types & constants ─────────────────────────────────────────────────────────

import {
  calcHours, buildRoomList,
  type CleaningType, type HouseCondition, type CookingFreq, type CookingStyle,
} from '../../lib/estimatorCalc';

const CLEANING_TYPES: CleaningType[]    = ['Standard Cleaning', 'Deep Cleaning', 'Move-Out/Move-In Cleaning'];
const HOUSE_CONDITIONS: HouseCondition[]= ['Pristine', 'Lightly Used', 'Normal', 'Moderately Dirty', 'Heavily Soiled'];
const COOKING_FREQS: CookingFreq[]      = ['Rarely', 'Occasionally', 'Frequently'];
const COOKING_STYLES: CookingStyle[]    = ['Light', 'Moderate', 'Heavy'];

const EXTRAS = [
  { id: 'oven',         label: 'Inside Oven',      hours: 1    },
  { id: 'refrigerator', label: 'Inside Fridge',    hours: 0.5  },
  { id: 'windows',      label: 'Windows',          hours: 1    },
  { id: 'basement',     label: 'Basement',         hours: 1    },
  { id: 'laundry',      label: 'Laundry (1 load)', hours: 0.5  },
  { id: 'garage',       label: 'Garage',           hours: 0.75 },
];
const EXTRA_MINS: Record<number, string> = { 1: '60', 0.5: '30', 0.75: '45' };

const MAX_PER_ROOM  = 5;
const MIN_TOTAL     = 5;
const MAX_TOTAL     = 10;

// ── Room list derived from form state — see frontend/src/lib/estimatorCalc.ts ──

// ── Checklist PDF download ────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<string, string> = { high: '[!!!]', medium: '[ ! ]', standard: '[   ]' };
const PRIORITY_COLOR: Record<string, [number, number, number]> = {
  high:     [185, 28,  28],   // red-700
  medium:   [180, 83,  9],    // amber-700
  standard: [75,  85,  99],   // gray-600
};

function downloadChecklist(
  result: EstimatorAnalysisResult,
  bedrooms: number, bathrooms: number, cleaningType: string,
) {
  const typeKey: CleaningTypeKey = cleaningType.includes('Move') ? 'moveout'
    : cleaningType.includes('Deep') ? 'deep' : 'standard';

  const analysedRooms = new Set(result.generatedChecklist.map(r => r.room.toLowerCase()));

  const doc   = new jsPDF({ unit: 'mm', format: 'letter' });
  const PW    = 216;   // letter width mm
  const PH    = 279;   // letter height mm
  const ML    = 18;    // margin left
  const MR    = 18;    // margin right
  const TW    = PW - ML - MR;
  const FOOT  = 10;    // footer height
  let y       = 18;

  // ── helpers ──────────────────────────────────────────────────────────────────

  function checkPage(needed = 7) {
    if (y + needed > PH - FOOT - 4) {
      doc.addPage();
      y = 18;
    }
  }

  function heading1(text: string) {
    checkPage(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(30, 64, 175);  // brand blue
    doc.text(text, ML, y);
    y += 7;
  }

  function sectionBanner(text: string) {
    checkPage(10);
    doc.setFillColor(30, 64, 175);
    doc.rect(ML, y, TW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(text, ML + 2, y + 5);
    y += 11;
  }

  function roomHeader(label: string) {
    checkPage(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text(label, ML, y);
    doc.setDrawColor(147, 197, 253);
    doc.line(ML, y + 1.5, ML + TW, y + 1.5);
    y += 6;
  }

  function subLabel(text: string) {
    checkPage(8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(text, ML, y);
    y += 5;
  }

  function noteText(text: string) {
    checkPage(6);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const wrapped = doc.splitTextToSize(`Note: ${text}`, TW - 4);
    doc.text(wrapped, ML + 2, y);
    y += wrapped.length * 4 + 1;
  }

  function taskRow(text: string, priority: string, aiNote?: string) {
    const priorityLabel = PRIORITY_LABEL[priority] ?? '[   ]';
    const [r, g, b]     = PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.standard;
    const fullText      = aiNote ? `${text}  → ${aiNote}` : text;
    const wrapped       = doc.splitTextToSize(fullText, TW - 22);
    checkPage(wrapped.length * 4.5 + 2);

    // Checkbox
    doc.setDrawColor(150, 150, 150);
    doc.rect(ML, y - 3, 3.5, 3.5);

    // Priority badge
    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(r, g, b);
    doc.text(priorityLabel, ML + 5, y);

    // Task text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(wrapped, ML + 18, y);
    y += wrapped.length * 4.5 + 1;
  }

  function footer() {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(150, 150, 150);
      doc.text('Generated by MaidLink AI Estimator · maidlink.ca', ML, PH - 6);
      doc.text(`Page ${i} of ${pages}`, PW - MR, PH - 6, { align: 'right' });
    }
  }

  // ── Cover / header ────────────────────────────────────────────────────────────

  heading1('MaidLink — Cleaning Checklist');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Date: ${new Date().toLocaleDateString('en-CA')}`, ML, y);       y += 5;
  doc.text(`Home: ${bedrooms} bed / ${bathrooms} bath · ${cleaningType}`, ML, y); y += 5;
  doc.text(`AI Estimate: ${result.oneCleanerHours} hrs (1 cleaner) · ${result.twoCleanerHours} hrs (2 cleaners)`, ML, y); y += 5;
  doc.text(`Condition: ${result.overallCondition.replace('_', ' ')}`, ML, y); y += 5;

  if (result.conditionAssessment) {
    const wrapped = doc.splitTextToSize(result.conditionAssessment, TW);
    doc.setFont('helvetica', 'italic');
    doc.text(wrapped, ML, y);
    y += wrapped.length * 4.5 + 2;
  }
  y += 4;

  // ── Room-by-room: AI highlights → full checklist ─────────────────────────────

  for (const roomDef of CLEANING_CHECKLIST) {
    const tasks = roomDef.items.filter(i => i.includedIn.includes(typeKey));
    if (tasks.length === 0) continue;

    const isOptional = roomDef.room === 'Basement' || roomDef.room === 'Garage';
    if (isOptional && !analysedRooms.has(roomDef.room.toLowerCase())) continue;

    // Match AI rooms whose name starts with this room type (handles "Bedroom 1", "Bathroom 2", etc.)
    const aiRooms      = result.generatedChecklist.filter(rc =>
      rc.room.toLowerCase().startsWith(roomDef.room.toLowerCase())
    );
    const aiBreakdowns = result.roomBreakdown.filter(rb =>
      rb.room.toLowerCase().startsWith(roomDef.room.toLowerCase())
    );

    const count     = roomDef.room === 'Bedroom' ? bedrooms
      : roomDef.room === 'Bathroom' ? bathrooms : 1;
    const totalMins = aiBreakdowns.reduce((sum, b) => sum + b.estimatedMinutes, 0);
    const timeStr   = totalMins > 0 ? `  ~${totalMins} min` : '';
    const countStr  = count > 1 ? ` (×${count})` : '';

    sectionBanner(`${roomDef.room.toUpperCase()}${countStr}${timeStr}`);

    if (aiRooms.length > 0) {
      subLabel('AI PRIORITY HIGHLIGHTS');
      for (const rc of aiRooms) {
        const bd = aiBreakdowns.find(b => b.room === rc.room);
        if (count > 1) roomHeader(rc.room);
        if (bd?.notes) noteText(bd.notes);
        for (const t of rc.tasks) taskRow(t.task, t.priority, t.aiNote ?? undefined);
        y += 1;
      }
      y += 2;
    }

    subLabel('FULL CHECKLIST');
    for (const item of tasks) taskRow(item.task, item.priority);
    y += 4;
  }

  // ── Footer on every page ──────────────────────────────────────────────────────

  footer();

  doc.save(`maidlink-checklist-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ── Shared UI components ──────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const STEPS = ['Home Details', 'Room Photos', 'Results'];
  return (
    <div className="flex items-center justify-center mb-6">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              i < step  ? 'bg-brand-600 text-white' :
              i === step ? 'bg-brand-700 text-white ring-4 ring-brand-200' :
                           'bg-gray-200 text-gray-500'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs mt-1 font-medium whitespace-nowrap ${i === step ? 'text-brand-700' : 'text-gray-400'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-10 mx-1 mb-5 transition-colors ${i < step ? 'bg-brand-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

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

// ── Condition & priority colour maps ─────────────────────────────────────────

const CONDITION_CLS: Record<string, string> = {
  pristine:   'bg-green-100 text-green-700',
  average:    'bg-blue-100 text-blue-700',
  messy:      'bg-amber-100 text-amber-700',
  very_messy: 'bg-red-100 text-red-700',
};
const PRIORITY_CLS: Record<string, string> = {
  high:     'bg-red-100 text-red-700',
  medium:   'bg-amber-100 text-amber-700',
  standard: 'bg-gray-100 text-gray-600',
};

// ── Main widget ───────────────────────────────────────────────────────────────

export function EstimatorWidget() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Step 0 — form state
  const [step,             setStep]            = useState(0);
  const [bedrooms,         setBedrooms]        = useState(2);
  const [bathrooms,        setBathrooms]       = useState(1);
  const [sqft,             setSqft]            = useState(1000);
  const [cleaningType,     setCleaningType]    = useState<CleaningType>('Standard Cleaning');
  const [houseCondition,   setHouseCondition]  = useState<HouseCondition>('Normal');
  const [pets,             setPets]            = useState(false);
  const [cookingFreq,      setCookingFreq]     = useState<CookingFreq>('Occasionally');
  const [cookingStyle,     setCookingStyle]    = useState<CookingStyle>('Moderate');
  const [extras,           setExtras]          = useState<string[]>([]);
  const [includeKitchen,   setIncludeKitchen]  = useState(true);
  const [includeLivingRoom, setIncludeLivingRoom] = useState(true);

  // Step 1 — per-room photos
  type PhotoEntry = { file: File; preview: string; s3Key: string | null };
  const [rooms,        setRooms]       = useState<string[]>([]);
  const [roomPhotos,   setRoomPhotos]  = useState<Record<string, PhotoEntry[]>>({});
  const [uploading,    setUploading]   = useState(false);
  const [uploadError,  setUploadError] = useState<string | null>(null);
  const [activeRoom,   setActiveRoom]  = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera capture state
  const [cameraRoom,        setCameraRoom]        = useState<string | null>(null);
  const [cameraMaxCaptures, setCameraMaxCaptures] = useState(0);

  // Desktop → mobile nudge
  const isTouchDevice  = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Step 2 — results
  const [analyzing,    setAnalyzing]   = useState(false);
  const [analyzeError, setAnalyzeError]= useState<string | null>(null);
  const [aiResult,     setAiResult]    = useState<EstimatorAnalysisResult | null>(null);
  const [openRooms,    setOpenRooms]   = useState<Set<string>>(new Set());

  // Auto-select extras for move-out
  useEffect(() => {
    if (cleaningType === 'Move-Out/Move-In Cleaning') {
      setExtras(EXTRAS.map(e => e.id));
    } else {
      setExtras([]);
    }
  }, [cleaningType]);

  // Derived values
  const { one, two } = calcHours(bedrooms, bathrooms, sqft, cleaningType, houseCondition, pets, cookingFreq, cookingStyle, extras);
  const isMoveOut     = cleaningType === 'Move-Out/Move-In Cleaning';
  const allPhotos     = Object.values(roomPhotos).flat();
  const totalPhotos   = allPhotos.length;
  const totalReady    = allPhotos.filter(p => p.s3Key !== null).length;
  const canAnalyze    = totalReady >= MIN_TOTAL && totalReady <= MAX_TOTAL && !uploading;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function goToStep1() {
    const roomList = buildRoomList(bedrooms, bathrooms, extras, includeKitchen, includeLivingRoom);
    setRooms(roomList);
    setRoomPhotos(prev => {
      const next: Record<string, PhotoEntry[]> = {};
      for (const r of roomList) next[r] = prev[r] ?? [];
      return next;
    });
    setStep(1);
  }

  function toggleExtra(id: string) {
    setExtras(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  }

  function openFilePicker(roomName: string) {
    const roomCount = roomPhotos[roomName]?.length ?? 0;
    if (roomCount >= MAX_PER_ROOM || totalPhotos >= MAX_TOTAL) return;
    setActiveRoom(roomName);
    if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeRoom) return;
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const roomCount   = roomPhotos[activeRoom]?.length ?? 0;
    const canAdd      = Math.min(MAX_PER_ROOM - roomCount, MAX_TOTAL - totalPhotos);
    const validFiles  = files.filter(f => f.type.startsWith('image/')).slice(0, canAdd);
    if (!validFiles.length) return;

    const oversized = validFiles.find(f => f.size > 10 * 1024 * 1024);
    if (oversized) { setUploadError('Each photo must be under 10 MB'); return; }

    setUploadError(null);
    setUploading(true);

    const newEntries: PhotoEntry[] = validFiles.map(file => ({
      file, preview: URL.createObjectURL(file), s3Key: null,
    }));
    const startIdx = roomCount;
    const room = activeRoom;

    setRoomPhotos(prev => ({ ...prev, [room]: [...(prev[room] ?? []), ...newEntries] }));

    const results = await Promise.allSettled(
      newEntries.map(async (entry, i) => {
        const { uploadUrl, s3Key } = await getEstimatorPhotoUploadUrl();
        await uploadEstimatorPhotoToS3(uploadUrl, entry.file);
        return { i, s3Key };
      })
    );

    setRoomPhotos(prev => {
      const updated = [...(prev[room] ?? [])];
      results.forEach(res => {
        if (res.status === 'fulfilled') {
          updated[startIdx + res.value.i] = { ...updated[startIdx + res.value.i], s3Key: res.value.s3Key };
        }
      });
      return { ...prev, [room]: updated };
    });

    const failures = results.filter(r => r.status === 'rejected').length;
    if (failures > 0) setUploadError(`${failures} photo(s) failed to upload.`);
    setUploading(false);
  }

  function removePhoto(roomName: string, index: number) {
    setRoomPhotos(prev => ({ ...prev, [roomName]: (prev[roomName] ?? []).filter((_, i) => i !== index) }));
    setAiResult(null);
  }

  function openCamera(roomName: string) {
    const roomCount  = roomPhotos[roomName]?.length ?? 0;
    const maxForRoom = Math.min(MAX_PER_ROOM - roomCount, MAX_TOTAL - totalPhotos);
    if (maxForRoom <= 0 || uploading) return;
    setCameraRoom(roomName);
    setCameraMaxCaptures(maxForRoom);
  }

  async function handleCameraCapture(roomName: string, file: File) {
    const roomCount = roomPhotos[roomName]?.length ?? 0;
    if (roomCount >= MAX_PER_ROOM || totalPhotos >= MAX_TOTAL) return;

    setUploadError(null);
    setUploading(true);

    const startIdx = roomCount;
    const entry: PhotoEntry = { file, preview: URL.createObjectURL(file), s3Key: null };
    setRoomPhotos(prev => ({ ...prev, [roomName]: [...(prev[roomName] ?? []), entry] }));

    try {
      const { uploadUrl, s3Key } = await getEstimatorPhotoUploadUrl();
      await uploadEstimatorPhotoToS3(uploadUrl, file);
      setRoomPhotos(prev => {
        const updated = [...(prev[roomName] ?? [])];
        updated[startIdx] = { ...updated[startIdx], s3Key };
        return { ...prev, [roomName]: updated };
      });
    } catch {
      setUploadError('Failed to upload captured photo. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleAnalyze() {
    if (!canAnalyze) return;
    setAnalyzeError(null);
    setAnalyzing(true);
    setAiResult(null);

    try {
      const roomsData = rooms
        .filter(r => (roomPhotos[r] ?? []).some(p => p.s3Key !== null))
        .map(r => ({
          room:         r,
          photoS3Keys: (roomPhotos[r] ?? []).map(p => p.s3Key).filter(Boolean) as string[],
        }));

      const sqftRange = sqft < 500 ? '<500'
        : sqft <= 1000 ? '500-1000'
        : sqft <= 1500 ? '1000-1500'
        : sqft <= 2000 ? '1500-2000'
        : sqft <= 2500 ? '2000-2500' : '2500+';

      const result = await analyzeEstimatorPhotos({
        bedrooms, bathrooms, sqftRange,
        condition:    houseCondition === 'Pristine' ? 'pristine'
                    : houseCondition === 'Lightly Used' ? 'average'
                    : houseCondition === 'Normal' ? 'average'
                    : houseCondition === 'Moderately Dirty' ? 'messy'
                    : 'very_messy',
        extras, cleaningType, pets, cookingFreq, cookingStyle,
        rooms: roomsData,
      });

      setAiResult(result);
      setOpenRooms(new Set(result.generatedChecklist.map(r => r.room)));

      // Attach to booking flow
      const allKeys = roomsData.flatMap(r => r.photoS3Keys);
      sessionStorage.setItem('estimatorPhotoKeys', JSON.stringify(allKeys));
      sessionStorage.setItem('estimatorChecklist', JSON.stringify(result.generatedChecklist));

      setStep(2);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? 'Analysis failed. Please try again.';
      setAnalyzeError(msg);
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleRoom(room: string) {
    setOpenRooms(prev => {
      const next = new Set(prev);
      if (next.has(room)) next.delete(room); else next.add(room);
      return next;
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <StepIndicator step={step} />

      {/* ═══════════════════════════════════ STEP 0: Home Details ══════════════ */}
      {step === 0 && (
        <>
          {/* ── Card 1: Your Home ─────────────────────────────────────────────── */}
          <div className="card space-y-5">
            <div className="grid grid-cols-2 gap-6">
              <Stepper label="Bedrooms"  value={bedrooms}  min={0} max={8} onChange={setBedrooms} />
              <Stepper label="Bathrooms" value={bathrooms} min={0} max={6} step={0.5} onChange={setBathrooms} />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <Stepper label="Square Footage" value={sqft} min={0} max={5000} step={100} onChange={setSqft} />
              <p className="text-xs text-gray-400 mt-1">Adjust in 100 sq ft increments</p>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="label mb-2">Living Spaces</label>
              <div className="flex gap-2">
                {[
                  { id: 'kitchen', label: 'Kitchen',     value: includeKitchen,    set: setIncludeKitchen },
                  { id: 'living',  label: 'Living Room', value: includeLivingRoom, set: setIncludeLivingRoom },
                ].map(({ id, label, value, set }) => (
                  <button key={id} type="button" onClick={() => set(v => !v)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                      value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
                    }`}>
                    {value ? '✓ ' : ''}{label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Card 2: Cleaning Preferences ──────────────────────────────────── */}
          <div className="card space-y-5">
            <ChipGroup label="Cleaning Type" options={CLEANING_TYPES} value={cleaningType} onChange={setCleaningType} />

            <div className="border-t border-gray-100 pt-4">
              <ChipGroup label="House Condition" options={HOUSE_CONDITIONS} value={houseCondition} onChange={setHouseCondition} />
            </div>

            <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
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

            <div className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ChipGroup label="Cooking Frequency" options={COOKING_FREQS} value={cookingFreq} onChange={setCookingFreq} />
              <ChipGroup label="Cooking Style"     options={COOKING_STYLES} value={cookingStyle} onChange={setCookingStyle} />
            </div>
          </div>

          {/* ── Card 3: Add-ons ───────────────────────────────────────────────── */}
          {!isMoveOut ? (
            <div className="card">
              <label className="label mb-2">Additional Tasks</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {EXTRAS.map(e => (
                  <button key={e.id} type="button" onClick={() => toggleExtra(e.id)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      extras.includes(e.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
                    }`}>
                    {e.label}
                    <span className={`block text-xs mt-0.5 ${extras.includes(e.id) ? 'text-brand-100' : 'text-gray-400'}`}>
                      +{EXTRA_MINS[e.hours]} min
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="card bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-800 font-medium">Move-Out/Move-In includes all add-ons</p>
              <p className="text-xs text-amber-600 mt-0.5">Oven, fridge, windows, basement, laundry & garage are all included.</p>
            </div>
          )}

          {/* Formula estimate */}
          <div className="card bg-brand-700 text-white">
            <h2 className="text-sm font-medium text-brand-200 mb-3">Formula Estimate</h2>
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
              Upload room photos in the next step for a smarter AI estimate.
            </p>
          </div>

          <button type="button" onClick={goToStep1} className="btn-primary w-full text-base py-3">
            Next: Upload Room Photos →
          </button>
        </>
      )}

      {/* ═══════════════════════════════════ STEP 1: Room Photos ═══════════════ */}
      {step === 1 && (
        <>
          {/* Desktop → mobile nudge */}
          {!isTouchDevice && !nudgeDismissed && (
            <div className="flex items-start gap-4 p-4 mb-4 rounded-xl bg-amber-50 border border-amber-200">
              <QRCodeSVG value={window.location.href} size={72} className="shrink-0 rounded" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-800 text-sm">Use your phone for best results</p>
                <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                  Scan the QR code to open this page on your phone — live camera gives the AI much better detail than uploaded photos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNudgeDismissed(true)}
                aria-label="Dismiss"
                className="text-amber-400 hover:text-amber-700 text-xl leading-none shrink-0 transition-colors"
              >×</button>
            </div>
          )}

          {!isAuthenticated ? (
            <div className="card text-center space-y-3">
              <p className="text-sm text-gray-600">Sign in to upload photos and get an AI-powered estimate.</p>
              <button onClick={() => { sessionStorage.setItem('authReturnTo', window.location.pathname); window.location.href = buildGoogleAuthUrl(); }}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 shadow-sm text-gray-700 font-medium text-sm transition-colors">
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
              <div className="card bg-brand-50 border border-brand-200">
                <p className="text-sm font-medium text-brand-800">Upload at least one photo per room</p>
                <p className="text-xs text-brand-600 mt-1">
                  Minimum {MIN_TOTAL} photos total · up to {MAX_PER_ROOM} per room · max {MAX_TOTAL} total · JPEG or PNG · 10 MB each
                </p>
              </div>

              {/* Upload progress */}
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {totalReady} / {MIN_TOTAL} minimum photos uploaded
                  </span>
                  <span className={`text-xs font-medium ${totalReady >= MIN_TOTAL ? 'text-green-600' : 'text-gray-400'}`}>
                    {totalReady >= MIN_TOTAL ? '✓ Ready to analyse' : `${MIN_TOTAL - totalReady} more needed`}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (totalReady / MIN_TOTAL) * 100)}%` }}
                  />
                </div>
              </div>

              {/* How to use camera — instructions card (mobile only) */}
              {isTouchDevice && (
                <div className="card bg-blue-50 border border-blue-200">
                  <p className="text-sm font-semibold text-blue-800 mb-1">📷 How to use the live camera</p>
                  <ol className="text-xs text-blue-700 space-y-1 list-none">
                    <li>1. Tap <strong>Camera</strong> on any room below to open your phone's camera.</li>
                    <li>2. Point at the room — the ring fills as you hold steady and <strong>auto-captures</strong>.</li>
                    <li>3. Or tap the shutter button anytime to capture manually.</li>
                    <li>4. Move to a different angle and repeat for a more accurate AI estimate.</li>
                    <li>5. Tap <strong>Done</strong> when finished with that room, then move to the next.</li>
                  </ol>
                  <p className="text-xs text-blue-500 mt-2">You can also upload photos from your gallery using the Upload button.</p>
                </div>
              )}

              {/* Per-room sections */}
              <div className="space-y-3">
                {rooms.map(room => {
                  const photos   = roomPhotos[room] ?? [];
                  const ready    = photos.filter(p => p.s3Key !== null).length;
                  const canAdd   = photos.length < MAX_PER_ROOM && totalPhotos < MAX_TOTAL;

                  return (
                    <div key={room} className={`card border-2 transition-colors ${ready > 0 ? 'border-brand-200' : 'border-gray-100'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-800">{room}</span>
                          {photos.length > 0 && (
                            <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                              {ready}/{photos.length} ready
                            </span>
                          )}
                        </div>
                        {canAdd && (
                          <div className="flex items-center gap-1.5">
                            {isTouchDevice && (
                              <button type="button" onClick={() => openCamera(room)} disabled={uploading}
                                className="text-xs px-2.5 py-1 rounded-lg border border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 transition-colors">
                                📷 Camera
                              </button>
                            )}
                            <button type="button" onClick={() => openFilePicker(room)} disabled={uploading}
                              className="text-xs px-2.5 py-1 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
                              + Upload
                            </button>
                          </div>
                        )}
                      </div>

                      {photos.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {photos.map((p, i) => (
                            <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                              <img src={p.preview} alt={`${room} ${i + 1}`} className="h-full w-full object-cover" />
                              {p.s3Key === null && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <Spinner size="sm" />
                                </div>
                              )}
                              {p.s3Key !== null && (
                                <button onClick={() => removePhoto(room, i)}
                                  className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-600">
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                          {canAdd && (
                            <button type="button" onClick={() => openFilePicker(room)} disabled={uploading}
                              className="h-20 w-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors flex-shrink-0 text-2xl">
                              +
                            </button>
                          )}
                        </div>
                      ) : isTouchDevice ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => openCamera(room)} disabled={uploading}
                            className="rounded-xl border-2 border-dashed border-blue-200 p-4 text-center hover:border-blue-400 bg-blue-50/40 transition-colors disabled:opacity-50">
                            <p className="text-lg mb-1">📷</p>
                            <p className="text-xs text-blue-600 font-medium">Live camera</p>
                            <p className="text-xs text-blue-400 mt-0.5">Auto-captures</p>
                          </button>
                          <button type="button" onClick={() => openFilePicker(room)} disabled={uploading}
                            className="rounded-xl border-2 border-dashed border-gray-200 p-4 text-center hover:border-brand-400 transition-colors disabled:opacity-50">
                            <p className="text-lg mb-1">🖼️</p>
                            <p className="text-xs text-gray-500 font-medium">Upload photo</p>
                            <p className="text-xs text-gray-400 mt-0.5">From gallery</p>
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => openFilePicker(room)} disabled={uploading}
                          className="w-full rounded-xl border-2 border-dashed border-gray-200 p-6 text-center hover:border-brand-400 transition-colors disabled:opacity-50">
                          <p className="text-2xl mb-1">🖼️</p>
                          <p className="text-sm text-gray-600 font-medium">Upload photos</p>
                          <p className="text-xs text-gray-400 mt-0.5">JPEG or PNG · up to 10 MB each</p>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png"
                multiple onChange={handleFileChange} className="hidden" />

              {/* Camera capture modal — renders full-screen when a room's camera is open */}
              {cameraRoom && (
                <CameraCapture
                  roomName={cameraRoom}
                  maxCaptures={cameraMaxCaptures}
                  isLastRoom={rooms.indexOf(cameraRoom) === rooms.length - 1}
                  onCapture={file => handleCameraCapture(cameraRoom, file)}
                  onClose={() => setCameraRoom(null)}
                />
              )}

              {uploadError  && <p className="text-xs text-red-600">{uploadError}</p>}
              {analyzeError && <p className="text-xs text-red-600">{analyzeError}</p>}

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(0)}
                  className="flex-none px-4 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  ← Back
                </button>
                <button type="button" onClick={handleAnalyze} disabled={!canAnalyze || analyzing}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                  {analyzing
                    ? <><Spinner size="sm" /> Analysing rooms…</>
                    : `Analyse ${totalReady} photo${totalReady !== 1 ? 's' : ''} with AI`}
                </button>
              </div>

              {analyzing && (
                <p className="text-xs text-gray-400 text-center">
                  AI is analysing each room… this usually takes 15–30 seconds.
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════ STEP 2: Results ═══════════════════ */}
      {step === 2 && !aiResult && (
        <div className="card text-center py-8">
          <p className="text-gray-500 text-sm">No results yet.{' '}
            <button onClick={() => setStep(1)} className="text-brand-600 underline">Go back</button>
          </p>
        </div>
      )}

      {step === 2 && aiResult && (
        <>
          {/* AI overall estimate */}
          <div className="card border-2 border-brand-400 bg-brand-50">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">✨</span>
              <h2 className="font-semibold text-brand-800">AI-Enhanced Estimate</h2>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CONDITION_CLS[aiResult.overallCondition] ?? 'bg-gray-100 text-gray-600'}`}>
                {aiResult.overallCondition.replace('_', ' ')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-brand-600 rounded-xl p-3 text-center text-white">
                <div className="text-2xl font-bold">{aiResult.oneCleanerHours} hrs</div>
                <div className="text-brand-200 text-xs mt-0.5">1 Cleaner</div>
              </div>
              <div className="bg-brand-600 rounded-xl p-3 text-center text-white">
                <div className="text-2xl font-bold">{aiResult.twoCleanerHours} hrs</div>
                <div className="text-brand-200 text-xs mt-0.5">2 Cleaners</div>
              </div>
            </div>
            <p className="text-sm text-gray-700">{aiResult.conditionAssessment}</p>
            {!aiResult.matchesSelfReport && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                Self-reported condition ({houseCondition}) was adjusted based on what the AI observed in the photos.
              </p>
            )}
            {aiResult.cleaningTypeNote && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                {aiResult.cleaningTypeNote}
              </p>
            )}
          </div>

          {/* Formula comparison */}
          <div className="card bg-gray-50 border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Formula estimate (for comparison)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="text-xl font-bold text-gray-700">{one} hrs</div>
                <div className="text-xs text-gray-400">1 Cleaner</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-gray-700">{two} hrs</div>
                <div className="text-xs text-gray-400">2 Cleaners</div>
              </div>
            </div>
          </div>

          {/* Coverage warnings — shown when AI detects missing angles */}
          {aiResult.coverageWarnings && aiResult.coverageWarnings.length > 0 && (
            <div className="card border border-amber-300 bg-amber-50">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Limited photo coverage detected</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    The AI couldn't see all angles in these rooms. Re-scan for a more accurate estimate.
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 mt-2">
                {aiResult.coverageWarnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-amber-800">
                    <span className="font-semibold flex-none">{w.room}:</span>
                    <span>{w.missing}</span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setStep(1)}
                className="mt-3 text-xs text-amber-700 underline font-medium hover:text-amber-900">
                ← Go back and add more photos
              </button>
            </div>
          )}

          {/* Room breakdown */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">Room-by-Room Breakdown</h3>
            <div className="space-y-2">
              {aiResult.roomBreakdown.map(room => (
                <div key={room.room} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-800">{room.room}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CONDITION_CLS[room.condition] ?? 'bg-gray-100 text-gray-600'}`}>
                        {room.condition.replace('_', ' ')}
                      </span>
                    </div>
                    {room.notes && <p className="text-xs text-gray-500 mt-1">{room.notes}</p>}
                    {room.priorityTasks.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {room.priorityTasks.map((t, i) => (
                          <span key={i} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-none">
                    <div className="text-sm font-bold text-gray-800">~{room.estimatedMinutes} min</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI-generated checklist */}
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-800">AI-Generated Cleaning Checklist</h3>
              <button type="button"
                onClick={() => downloadChecklist(aiResult, bedrooms, bathrooms, cleaningType)}
                className="text-xs px-3 py-1.5 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 font-medium transition-colors">
                ↓ Download PDF
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Customised from your photos. <span className="text-red-600 font-medium">!!!</span> = high priority · <span className="text-amber-600 font-medium">!</span> = medium
            </p>

            <div className="space-y-2">
              {aiResult.generatedChecklist.map(rc => {
                const highCount = rc.tasks.filter(t => t.priority === 'high').length;
                return (
                  <div key={rc.room} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button type="button" onClick={() => toggleRoom(rc.room)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-800">{rc.room}</span>
                        <span className="text-xs text-gray-400">{rc.tasks.length} tasks</span>
                        {highCount > 0 && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                            {highCount} high priority
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400 text-xs">{openRooms.has(rc.room) ? '▲' : '▼'}</span>
                    </button>

                    {openRooms.has(rc.room) && (
                      <div className="px-4 py-2 divide-y divide-gray-50">
                        {rc.tasks.map((task, i) => (
                          <div key={i} className="flex items-start gap-2 py-2">
                            <span className={`text-xs font-mono flex-none mt-0.5 px-1.5 py-0.5 rounded font-bold ${PRIORITY_CLS[task.priority]}`}>
                              {task.priority === 'high' ? '!!!' : task.priority === 'medium' ? ' ! ' : '   '}
                            </span>
                            <div className="flex-1">
                              <span className="text-sm text-gray-800">{task.task}</span>
                              {task.aiNote && (
                                <p className="text-xs text-brand-600 mt-0.5 italic">{task.aiNote}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {aiResult.confidenceNote && (
            <p className="text-xs text-gray-400 italic text-center px-4">{aiResult.confidenceNote}</p>
          )}

          <button type="button" onClick={() => navigate('/maids')} className="btn-primary w-full text-base py-3">
            Book a cleaner with this estimate
          </button>
          <button type="button" onClick={() => setStep(1)}
            className="w-full text-sm text-center text-gray-500 hover:text-gray-700 py-2">
            ← Back to photos
          </button>
          <button type="button" onClick={() => navigate('/estimate/history')}
            className="w-full text-sm text-center text-brand-600 hover:text-brand-800 py-1">
            View past estimates →
          </button>
        </>
      )}
    </div>
  );
}
