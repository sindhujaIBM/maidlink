import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { AlphaFeedbackForm } from './AlphaFeedbackForm';
import { useNavigate, useLocation } from 'react-router-dom';
import { Spinner } from '../ui/Spinner';
import { snapSqft } from '../ui/FormControls';
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

const QRCodeSVG = lazy(() =>
  import('qrcode.react').then(m => ({ default: m.QRCodeSVG }))
);

// ── Types & constants ─────────────────────────────────────────────────────────

import {
  calcHours, buildRoomList, getRate, FREQ_MULTIPLIER, roundHours, NEWBIE_MULTIPLIER,
  type CleaningType, type HouseCondition, type CookingFreq, type CookingStyle, type CleanFrequency,
} from '../../lib/estimatorCalc';

const CLEANING_TYPES: CleaningType[] = [
  'Standard Cleaning',
  'Deep Cleaning',
  'Move-Out/Move-In Cleaning',
  'Short-Term Rental Turnover',
];

const CLEAN_FREQUENCIES: CleanFrequency[] = ['One-time', 'Monthly', 'Biweekly', 'Weekly'];
const HOUSE_CONDITIONS: HouseCondition[] = ['Pristine', 'Lightly Used', 'Normal', 'Moderately Dirty', 'Heavily Soiled'];


const EXTRAS = [
  { id: 'oven',         label: 'Inside Oven',   hours: 1    },
  { id: 'refrigerator', label: 'Inside Fridge', hours: 0.5  },
  { id: 'windows',      label: 'Windows',       hours: 1    },
  { id: 'basement',     label: 'Basement',      hours: 1    },
  { id: 'garage',       label: 'Garage',        hours: 0.75 },
];
// These are always included in Move-Out; basement/garage remain user-controlled
const MOVEOUT_LOCKED_EXTRAS = ['oven', 'refrigerator', 'windows'];
const EXTRA_MINS: Record<number, string> = { 1: '60', 0.5: '30', 0.75: '45' };

const MAX_PER_ROOM  = 5;

// ── Room list derived from form state — see frontend/src/lib/estimatorCalc.ts ──

// ── Checklist PDF download ────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<string, string> = { high: '[!!!]', medium: '[ ! ]', standard: '[   ]' };
const PRIORITY_COLOR: Record<string, [number, number, number]> = {
  high:     [185, 28,  28],   // red-700
  medium:   [180, 83,  9],    // amber-700
  standard: [75,  85,  99],   // gray-600
};

async function downloadChecklist(
  result: EstimatorAnalysisResult,
  bedrooms: number, bathrooms: number, cleaningType: string,
) {
  const { default: jsPDF } = await import('jspdf');

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
  doc.text(`AI Estimate: ${result.oneCleanerHours}–${roundHours(result.oneCleanerHours * NEWBIE_MULTIPLIER)} hrs (1 cleaner) · ${result.twoCleanerHours}–${roundHours(result.twoCleanerHours * NEWBIE_MULTIPLIER)} hrs (2 cleaners)`, ML, y); y += 5;
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

// ── Step 0 sub-components ─────────────────────────────────────────────────────

function S0Card({ num, title, sub, children }: { num: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-7 h-7 rounded-lg bg-amber-50 text-brand-700 flex items-center justify-center font-bold text-sm flex-shrink-0"
          style={{ fontFamily: 'Fraunces, Georgia, serif' }}>{num}</div>
        <div>
          <div className="font-semibold text-gray-900 leading-snug" style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '1.05rem' }}>{title}</div>
          <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function S0Stepper({ label, value, onDec, onInc, suffix }: { label: string; value: number; onDec: () => void; onInc: () => void; suffix?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{label}</div>
      <div className="flex items-center justify-between p-1.5 border border-stone-200 rounded-xl bg-white">
        <button type="button" onClick={onDec} data-testid={`stepper-${label.toLowerCase()}-dec`} className="w-8 h-8 rounded-lg bg-amber-50 text-gray-700 flex items-center justify-center text-base hover:bg-stone-100 transition-colors">−</button>
        <span style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-xl font-semibold text-gray-900">
          {value}{suffix && <span className="text-[11px] text-gray-400 ml-0.5 font-normal" style={{ fontFamily: 'Inter, sans-serif' }}>{suffix}</span>}
        </span>
        <button type="button" onClick={onInc} data-testid={`stepper-${label.toLowerCase()}-inc`} className="w-8 h-8 rounded-lg bg-brand-700 text-white flex items-center justify-center text-base hover:bg-brand-800 transition-colors">+</button>
      </div>
    </div>
  );
}

function S0Pill({ active, onClick, children, sub }: { active: boolean; onClick: () => void; children: React.ReactNode; sub?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-2 rounded-xl font-semibold text-sm transition-colors inline-flex items-baseline gap-1.5 flex-shrink-0
        ${active ? 'border-brand-600 bg-brand-50 text-brand-800 border' : 'border border-stone-200 bg-white text-gray-700 hover:border-brand-300'}`}>
      {children}
      {sub && <span className="text-[10px] font-medium opacity-70">{sub}</span>}
    </button>
  );
}

function S0BigOption({ active, onClick, title, sub, badge }: { active: boolean; onClick: () => void; title: string; sub: string; badge: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`p-4 text-left relative rounded-xl transition-colors w-full
        ${active ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white hover:border-brand-300'}`}
      style={{ border: `1.5px solid ${active ? '#1F6E64' : '#E6E1D3'}` }}>
      <div className={`absolute top-3 right-3 text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wide
        ${active ? 'bg-brand-600 text-white' : 'bg-amber-50 text-gray-400'}`}>{badge}</div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mb-3 transition-colors
        ${active ? 'border-brand-600 bg-brand-600' : 'border-gray-300 bg-white'}`}>
        {active && <div className="w-2 h-2 rounded-full bg-white"/>}
      </div>
      <div className="font-semibold text-sm leading-tight" style={{ fontFamily: 'Fraunces, Georgia, serif', color: active ? '#1F6E64' : '#1A1F1E' }}>{title}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </button>
  );
}

function S0ConditionTile({ active, onClick, label, sub, level }: { active: boolean; onClick: () => void; label: string; sub: string; level: number }) {
  return (
    <button type="button" onClick={onClick}
      className={`p-3 text-center flex flex-col items-center gap-2 rounded-xl transition-colors w-full
        ${active ? 'bg-brand-50' : 'bg-white hover:border-brand-300'}`}
      style={{ border: `1.5px solid ${active ? '#1F6E64' : '#E6E1D3'}` }}>
      <div className="flex gap-1">
        {[1,2,3,4].map(i => (
          <div key={i} className="w-5 h-1 rounded-full transition-colors"
            style={{ background: i <= level ? (active ? '#1F6E64' : '#D4A93A') : '#E6E1D3' }}/>
        ))}
      </div>
      <div className="text-sm font-semibold" style={{ color: active ? '#1F6E64' : '#1A1F1E' }}>{label}</div>
      <div className="text-[10px] text-gray-400">{sub}</div>
    </button>
  );
}

function S0ExtraTile({ active, onClick, label, time, locked }: { active: boolean; onClick: () => void; label: string; time: string; locked?: boolean }) {
  return (
    <button type="button" onClick={locked ? undefined : onClick}
      className={`p-3 text-left flex items-center justify-between gap-2 rounded-xl transition-colors
        ${active ? 'bg-brand-50' : 'bg-white'}
        ${locked ? 'cursor-default opacity-60' : 'cursor-pointer hover:border-brand-400'}`}
      style={{ border: `1.5px solid ${active ? '#1F6E64' : '#E6E1D3'}` }}>
      <div>
        <div className="text-sm font-semibold" style={{ color: active ? '#1F6E64' : '#1A1F1E' }}>{label}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">{time}</div>
      </div>
      <div className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-colors"
        style={{ border: `1.5px solid ${active ? '#1F6E64' : '#E6E1D3'}`, background: active ? '#1F6E64' : 'white' }}>
        {active && <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M4 12.5L10 18L20 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
    </button>
  );
}

// ── Shared UI components ──────────────────────────────────────────────────────

function StepIndicator({ step, maxStep, hasResults, onStepClick }: {
  step: number; maxStep: number; hasResults: boolean;
  onStepClick: (i: number) => void;
}) {
  const STEPS = ['Home Details', 'Room Photos', 'Results'];
  return (
    <div className="flex items-center justify-center mb-6">
      {STEPS.map((label, i) => {
        const reachable = i !== step && i <= maxStep && (i !== 2 || hasResults);
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onStepClick(i)}
                disabled={!reachable}
                title={reachable ? `Go to ${label}` : i > maxStep ? 'Complete previous steps first' : undefined}
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                  ${reachable ? 'hover:ring-2 hover:ring-brand-300 cursor-pointer' : i === step ? 'cursor-default' : 'cursor-not-allowed opacity-60'}
                  ${i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-700 text-white ring-4 ring-brand-200' : 'bg-gray-200 text-gray-500'}
                `}>
                {i < step ? '✓' : i + 1}
              </button>
              <span className={`text-xs mt-1 font-medium whitespace-nowrap ${
                i === step ? 'text-brand-700' : reachable ? 'text-brand-500 cursor-pointer' : 'text-gray-400'
              }`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-10 mx-1 mb-5 transition-colors ${i < step ? 'bg-brand-600' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
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

const FORM_STORAGE_KEY = 'estimator_form_state';

// ── Main widget ───────────────────────────────────────────────────────────────

export function EstimatorWidget() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { state: prefill } = useLocation() as { state: null | {
    bedrooms?: number; bathrooms?: number; sqft?: number;
    cleaningType?: CleaningType; houseCondition?: HouseCondition;
  }};

  // Whether this session originated from the landing-page prefill flow — survives OAuth redirect.
  // useMemo runs during render, before the restore effect clears sessionStorage, so it reads correctly.
  const fromLandingPage = useMemo(() => {
    if (prefill) return true;
    try {
      const s = JSON.parse(sessionStorage.getItem(FORM_STORAGE_KEY) ?? 'null');
      return s?.fromLandingPage === true;
    } catch { return false; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 0 — form state
  // Lazy initializer reads sessionStorage so the correct step is set before first render (no flash).
  const [step,             setStep]            = useState(() => {
    if (prefill) return 1;
    try {
      const s = JSON.parse(sessionStorage.getItem(FORM_STORAGE_KEY) ?? 'null');
      if (s?.step === 1) return 1;
    } catch {}
    return 0;
  });
  // Tracks the highest step ever reached — determines which step circles are clickable.
  const [maxStep, setMaxStep] = useState(() => {
    if (prefill) return 1;
    try {
      const s = JSON.parse(sessionStorage.getItem(FORM_STORAGE_KEY) ?? 'null');
      return typeof s?.step === 'number' ? s.step : 0;
    } catch { return 0; }
  });
  const [bedrooms,         setBedrooms]        = useState(prefill?.bedrooms      ?? 2);
  const [bathrooms,        setBathrooms]       = useState(prefill?.bathrooms     ?? 1);
  const [sqft,             setSqft]            = useState(prefill?.sqft != null ? snapSqft(prefill.sqft) : 750);
  const [cleaningType,     setCleaningType]    = useState<CleaningType>(prefill?.cleaningType   ?? 'Standard Cleaning');
  const [houseCondition,   setHouseCondition]  = useState<HouseCondition>(prefill?.houseCondition ?? 'Normal');
  const [pets,             setPets]            = useState(false);
  const [cookingFreq,      setCookingFreq]     = useState<CookingFreq>('Occasionally');
  const [cookingStyle,     setCookingStyle]    = useState<CookingStyle>('Moderate');
  const [frequency,        setFrequency]       = useState<CleanFrequency>('One-time');
  const [extras,           setExtras]          = useState<string[]>([]);
  const [includeKitchen,   setIncludeKitchen]  = useState(true);
  const [includeLivingRoom, setIncludeLivingRoom] = useState(true);

  // Step 0 display-level state — derived → existing calc state via useEffect
  type PetLevel     = 'none' | 'one' | 'multi';
  type CookingLevel = 'rare' | 'weekly' | 'daily';
  const [petLevel,     setPetLevel]     = useState<PetLevel>('none');
  const [cookingLevel, setCookingLevel] = useState<CookingLevel>('weekly');
  const [livingSpaces, setLivingSpaces] = useState(1);

  // Step 1 — per-room photos
  type PhotoEntry = { file: File; preview: string; s3Key: string | null; failed?: boolean };
  const [rooms,        setRooms]       = useState<string[]>([]);
  const [roomPhotos,   setRoomPhotos]  = useState<Record<string, PhotoEntry[]>>({});
  const [uploadingCount, setUploadingCount] = useState(0);
  const uploading = uploadingCount > 0;
  const [uploadError,  setUploadError] = useState<string | null>(null);
  const [activeRoom,   setActiveRoom]  = useState<string | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const roomRefsMap   = useRef<Record<string, HTMLDivElement | null>>({});

  // Camera capture state
  const [cameraRoom,        setCameraRoom]        = useState<string | null>(null);
  const [cameraMaxCaptures, setCameraMaxCaptures] = useState(0);

  // Desktop → mobile nudge
  const isTouchDevice  = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const [nudgeDismissed, setNudgeDismissed] = useState(true);

  // Step 1 UI state — refine chip bar + tips drawer
  const [refineOpen, setRefineOpen] = useState(false);
  const [tipsOpen,   setTipsOpen]   = useState(false);

  // Step 1 — coverage review
  const [showReview,   setShowReview]  = useState(false);

  // Step 2 — results
  const [analyzing,    setAnalyzing]   = useState(false);
  const [analyzeError, setAnalyzeError]= useState<string | null>(null);
  const [aiResult,     setAiResult]    = useState<EstimatorAnalysisResult | null>(null);
  const [openRooms,    setOpenRooms]   = useState<Set<string>>(new Set());

  // ── Persist form across OAuth redirect ───────────────────────────────────

  useEffect(() => {
    const saved = sessionStorage.getItem(FORM_STORAGE_KEY);
    if (!saved) return;
    sessionStorage.removeItem(FORM_STORAGE_KEY);
    try {
      const s = JSON.parse(saved);
      if (s.bedrooms      !== undefined) setBedrooms(s.bedrooms);
      if (s.bathrooms     !== undefined) setBathrooms(s.bathrooms);
      if (s.sqft          !== undefined) setSqft(s.sqft);
      if (s.cleaningType  !== undefined) setCleaningType(s.cleaningType);
      if (s.houseCondition!== undefined) setHouseCondition(s.houseCondition);
      if (s.pets          !== undefined) setPets(s.pets);
      if (s.cookingFreq   !== undefined) setCookingFreq(s.cookingFreq);
      if (s.cookingStyle  !== undefined) setCookingStyle(s.cookingStyle);
      if (s.frequency     !== undefined) setFrequency(s.frequency);
      if (s.extras        !== undefined) setExtras(s.extras);
      if (s.includeKitchen    !== undefined) setIncludeKitchen(s.includeKitchen);
      if (s.includeLivingRoom !== undefined) setIncludeLivingRoom(s.includeLivingRoom);
      // New display-level state (with backwards-compat fallback from old boolean pets)
      if (s.petLevel      !== undefined) setPetLevel(s.petLevel);
      else if (s.pets !== undefined)     setPetLevel(s.pets ? 'one' : 'none');
      if (s.cookingLevel  !== undefined) setCookingLevel(s.cookingLevel);
      if (s.livingSpaces  !== undefined) setLivingSpaces(s.livingSpaces);
    } catch { /* ignore corrupt storage */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function saveFormState() {
    sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({
      step, fromLandingPage,
      bedrooms, bathrooms, sqft, cleaningType, houseCondition,
      frequency, extras, includeKitchen, includeLivingRoom,
      petLevel, cookingLevel, livingSpaces,
    }));
  }

  // Sync petLevel → pets (boolean for calc engine + API)
  useEffect(() => { setPets(petLevel !== 'none'); }, [petLevel]);

  // Sync cookingLevel → cookingFreq + cookingStyle (for calc engine + API)
  useEffect(() => {
    if (cookingLevel === 'rare')   { setCookingFreq('Rarely');      setCookingStyle('Light');    }
    if (cookingLevel === 'weekly') { setCookingFreq('Occasionally'); setCookingStyle('Moderate'); }
    if (cookingLevel === 'daily')  { setCookingFreq('Frequently');   setCookingStyle('Heavy');    }
  }, [cookingLevel]);

  // Sync livingSpaces → includeLivingRoom
  useEffect(() => { setIncludeLivingRoom(livingSpaces > 0); }, [livingSpaces]);

  // Reset frequency for types that don't support recurring (Move-Out and STR are always one-time)
  useEffect(() => {
    if (cleaningType !== 'Standard Cleaning' && cleaningType !== 'Deep Cleaning') {
      setFrequency('One-time');
    }
  }, [cleaningType]);

  // Auto-select locked extras for move-out (oven, fridge, windows); leave basement/garage as-is
  useEffect(() => {
    if (cleaningType === 'Move-Out/Move-In Cleaning') {
      setExtras(prev => [...new Set([...prev, ...MOVEOUT_LOCKED_EXTRAS])]);
    } else {
      setExtras([]);
    }
  }, [cleaningType]);

  // Build room list on mount when step starts at 1 (prefill flow or OAuth return to step 1)
  useEffect(() => {
    if (step !== 1) return;
    const roomList = buildRoomList(bedrooms, bathrooms, extras, includeKitchen, includeLivingRoom);
    setRooms(roomList);
    setRoomPhotos(prev => {
      const next: Record<string, PhotoEntry[]> = {};
      for (const r of roomList) next[r] = prev[r] ?? [];
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep room list in sync when extras change from the refine strip (basement/garage affect rooms)
  useEffect(() => {
    if (step !== 1) return;
    const roomList = buildRoomList(bedrooms, bathrooms, extras, includeKitchen, includeLivingRoom);
    setRooms(roomList);
    setRoomPhotos(prev => {
      const next: Record<string, PhotoEntry[]> = {};
      for (const r of roomList) next[r] = prev[r] ?? [];
      return next;
    });
  }, [extras, bedrooms, bathrooms, includeKitchen, includeLivingRoom, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived values
  const { one, two, oneMax, twoMax } = calcHours(bedrooms, bathrooms, sqft, cleaningType, houseCondition, pets, cookingFreq, cookingStyle, extras, frequency);
  const isMoveOut = cleaningType === 'Move-Out/Move-In Cleaning';


  const MIN_PHOTOS_PER_ROOM = 2;
  const allPhotos     = Object.values(roomPhotos).flat();
  const totalReady    = allPhotos.filter(p => p.s3Key !== null).length;
  const roomsReady    = rooms.filter(r =>
    (roomPhotos[r] ?? []).filter(p => p.s3Key !== null && !p.failed).length >= MIN_PHOTOS_PER_ROOM
  ).length;
  // Single-room bookings only need 2 uploaded photos to enable analysis.
  const canAnalyze = rooms.length > 0 && roomsReady === rooms.length && !uploading;

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Keep maxStep at the highest step reached so the indicator knows what's clickable.
  useEffect(() => {
    setMaxStep((prev: number) => Math.max(prev, step));
  }, [step]);

  function handleStepClick(i: number) {
    if (i === step) return;
    if (i > maxStep) return;
    if (i === 2 && !aiResult) return;
    setStep(i);
  }

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
    if (roomCount >= MAX_PER_ROOM) return;
    setActiveRoom(roomName);
    if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeRoom) return;
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const roomCount  = roomPhotos[activeRoom]?.length ?? 0;
    const canAdd     = MAX_PER_ROOM - roomCount;
    const validFiles = files.filter(f => f.type.startsWith('image/')).slice(0, canAdd);
    if (!validFiles.length) return;

    const oversized = validFiles.find(f => f.size > 10 * 1024 * 1024);
    if (oversized) { setUploadError('Each photo must be under 10 MB'); return; }

    setUploadError(null);
    setUploadingCount(c => c + validFiles.length);

    const room = activeRoom;
    const newEntries: PhotoEntry[] = validFiles.map(file => ({
      file, preview: URL.createObjectURL(file), s3Key: null, failed: false,
    }));
    setRoomPhotos(prev => ({ ...prev, [room]: [...(prev[room] ?? []), ...newEntries] }));

    // Upload sequentially with one retry each so a single network blip doesn't lose multiple photos.
    let failures = 0;
    for (const entry of newEntries) {
      let uploaded = false;
      for (let attempt = 0; attempt < 2 && !uploaded; attempt++) {
        try {
          const { uploadUrl, s3Key } = await getEstimatorPhotoUploadUrl();
          await uploadEstimatorPhotoToS3(uploadUrl, entry.file);
          setRoomPhotos(prev => ({
            ...prev,
            [room]: (prev[room] ?? []).map(p => p.file === entry.file ? { ...p, s3Key, failed: false } : p),
          }));
          uploaded = true;
        } catch {
          if (attempt === 1) {
            setRoomPhotos(prev => ({
              ...prev,
              [room]: (prev[room] ?? []).map(p => p.file === entry.file ? { ...p, failed: true } : p),
            }));
            failures++;
          }
        }
      }
      setUploadingCount(c => Math.max(0, c - 1));
    }

    if (failures > 0) setUploadError('Some photos failed — tap the red photos to retry.');
  }

  function removePhoto(roomName: string, index: number) {
    setRoomPhotos(prev => ({ ...prev, [roomName]: (prev[roomName] ?? []).filter((_, i) => i !== index) }));
    setAiResult(null);
  }

  function openCamera(roomName: string) {
    const roomCount  = roomPhotos[roomName]?.length ?? 0;
    const maxForRoom = MAX_PER_ROOM - roomCount;
    if (maxForRoom <= 0 || uploading) return;
    setCameraRoom(roomName);
    setCameraMaxCaptures(maxForRoom);
  }

  async function handleCameraCapture(roomName: string, file: File) {
    // Check capacity using functional update so concurrent captures see each other's additions.
    let atCapacity = false;
    setRoomPhotos(prev => {
      const existing = prev[roomName] ?? [];
      if (existing.length >= MAX_PER_ROOM) { atCapacity = true; return prev; }
      return { ...prev, [roomName]: [...existing, { file, preview: URL.createObjectURL(file), s3Key: null, failed: false }] };
    });
    if (atCapacity) return;

    setUploadError(null);
    setUploadingCount(c => c + 1);

    let uploaded = false;
    for (let attempt = 0; attempt < 2 && !uploaded; attempt++) {
      try {
        const { uploadUrl, s3Key } = await getEstimatorPhotoUploadUrl();
        await uploadEstimatorPhotoToS3(uploadUrl, file);
        setRoomPhotos(prev => ({
          ...prev,
          [roomName]: (prev[roomName] ?? []).map(p => p.file === file ? { ...p, s3Key, failed: false } : p),
        }));
        uploaded = true;
      } catch {
        if (attempt === 1) {
          setRoomPhotos(prev => ({
            ...prev,
            [roomName]: (prev[roomName] ?? []).map(p => p.file === file ? { ...p, failed: true } : p),
          }));
          setUploadError('Photo failed to upload — tap it to retry.');
        }
      }
    }
    setUploadingCount(c => Math.max(0, c - 1));
  }

  async function retryPhoto(roomName: string, idx: number) {
    const entry = (roomPhotos[roomName] ?? [])[idx];
    if (!entry?.failed) return;

    setRoomPhotos(prev => ({
      ...prev,
      [roomName]: (prev[roomName] ?? []).map(p => p.file === entry.file ? { ...p, failed: false, s3Key: null } : p),
    }));
    setUploadError(null);
    setUploadingCount(c => c + 1);

    let uploaded = false;
    for (let attempt = 0; attempt < 2 && !uploaded; attempt++) {
      try {
        const { uploadUrl, s3Key } = await getEstimatorPhotoUploadUrl();
        await uploadEstimatorPhotoToS3(uploadUrl, entry.file);
        setRoomPhotos(prev => ({
          ...prev,
          [roomName]: (prev[roomName] ?? []).map(p => p.file === entry.file ? { ...p, s3Key, failed: false } : p),
        }));
        uploaded = true;
      } catch {
        if (attempt === 1) {
          setRoomPhotos(prev => ({
            ...prev,
            [roomName]: (prev[roomName] ?? []).map(p => p.file === entry.file ? { ...p, failed: true } : p),
          }));
          setUploadError('Retry failed — please check your connection.');
        }
      }
    }
    setUploadingCount(c => Math.max(0, c - 1));
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
      {/* Step indicator — only for step 2; steps 0 and 1 have their own inline indicators */}
      {step === 2 && <StepIndicator step={step} maxStep={maxStep} hasResults={!!aiResult} onStepClick={handleStepClick} />}

      {/* ═══════════════════════════════════ STEP 0: Home Details ══════════════ */}
      {step === 0 && (() => {
        const rate    = getRate(cleaningType, frequency);
        const priceMin = Math.round(one * rate);
        const priceMax = Math.round(oneMax * rate);
        const cleaners = one > 5 ? 2 : 1;
        const onSite   = cleaners === 2 ? one / 2 : one;
        const condLabel: Record<string, string> = {
          Pristine: 'Pristine', 'Lightly Used': 'Normal', Normal: 'Normal',
          'Moderately Dirty': 'Dirty', 'Heavily Soiled': 'Heavy',
        };
        return (
          <div className="space-y-6">
            {/* ── Header ────────────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold tracking-widest text-brand-600 uppercase mb-1">
                  Free Calgary Estimate · Step 1 of 3
                </div>
                <h1 style={{ fontFamily: 'Fraunces, Georgia, serif' }}
                  className="text-3xl sm:text-4xl font-medium text-gray-900 tracking-tight leading-tight m-0">
                  Tell us about your home
                </h1>
                <p className="text-sm sm:text-base text-gray-400 mt-2 max-w-xl">
                  Five quick groups. Your estimate updates live — no commitment, no card.
                </p>
              </div>
              <div className="hidden sm:flex items-center flex-shrink-0 mb-1">
                {[
                  { n: 1, l: 'Home', active: true },
                  { n: 2, l: 'Photos', active: false },
                  { n: 3, l: 'Results', active: false },
                ].map((s, i, arr) => {
                  const reachable = i > 0 && i <= maxStep && (i !== 2 || !!aiResult);
                  return (
                    <div key={s.n} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <button type="button"
                          onClick={() => reachable ? handleStepClick(i) : undefined}
                          className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                            ${s.active ? 'bg-brand-700 text-white ring-4 ring-brand-200' : reachable ? 'bg-brand-500 text-white cursor-pointer hover:bg-brand-600' : 'bg-gray-200 text-gray-500 cursor-default'}`}>
                          {s.n}
                        </button>
                        <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${s.active ? 'text-brand-700' : reachable ? 'text-brand-500' : 'text-gray-400'}`}>
                          {s.l}
                        </span>
                      </div>
                      {i < arr.length - 1 && <div className={`h-0.5 w-8 mx-1 mb-4 ${i < 1 ? 'bg-gray-200' : 'bg-gray-200'}`}/>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Mobile live estimate strip ─────────────────────────────────────── */}
            <div className="lg:hidden rounded-2xl p-3 flex items-center justify-between text-white"
              style={{ background: 'linear-gradient(135deg, #1F6E64, #17524B)' }}>
              <div>
                <div className="text-[9px] font-bold tracking-widest opacity-80 uppercase">Live Estimate</div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-xl font-semibold">
                    {onSite.toFixed(1)}h
                  </span>
                  <span className="text-xs opacity-75">· {cleaners} cleaner{cleaners > 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold tracking-widest opacity-80 uppercase">Price</div>
                <div style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-base font-semibold text-amber-300">
                  ${priceMin}–${priceMax}
                </div>
              </div>
            </div>

            {/* ── Two-column grid ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">

              {/* LEFT: 5 numbered cards */}
              <div className="flex flex-col gap-5">

                {/* Card 1: Your home */}
                <S0Card num="1" title="Your home" sub="Quick layout — we'll refine with photos next.">
                  <div className="grid grid-cols-3 gap-3">
                    <S0Stepper label="Bedrooms" value={bedrooms}
                      onDec={() => setBedrooms(Math.max(0, bedrooms - 1))} onInc={() => setBedrooms(Math.min(8, bedrooms + 1))}/>
                    <S0Stepper label="Bathrooms" value={bathrooms}
                      onDec={() => setBathrooms(Math.max(0, bathrooms - 0.5))} onInc={() => setBathrooms(Math.min(6, bathrooms + 0.5))}/>
                    <S0Stepper label="Sq ft" value={sqft} suffix=" sf"
                      onDec={() => setSqft(Math.max(400, sqft - 100))} onInc={() => setSqft(Math.min(6000, sqft + 100))}/>
                  </div>
                  <div className="mt-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Living spaces</div>
                    <div className="flex gap-2 flex-wrap">
                      {([0,1,2,3] as const).map(n => (
                        <S0Pill key={n} active={livingSpaces === n} onClick={() => setLivingSpaces(n)}>{n}</S0Pill>
                      ))}
                      <S0Pill active={livingSpaces >= 4} onClick={() => setLivingSpaces(4)}>4+</S0Pill>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">Living rooms, dining rooms, family rooms, dens</p>
                  </div>
                </S0Card>

                {/* Card 2: Cleaning type */}
                <S0Card num="2" title="Cleaning type" sub="Standard for upkeep · Deep for a reset · Move-out for empty homes.">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <S0BigOption active={cleaningType === 'Standard Cleaning'} onClick={() => setCleaningType('Standard Cleaning')}
                      title="Standard" sub="Recurring maintenance" badge="Most popular"/>
                    <S0BigOption active={cleaningType === 'Deep Cleaning'} onClick={() => setCleaningType('Deep Cleaning')}
                      title="Deep clean" sub="Top-to-bottom reset" badge="+50% time"/>
                    <S0BigOption active={cleaningType === 'Move-Out/Move-In Cleaning'} onClick={() => setCleaningType('Move-Out/Move-In Cleaning')}
                      title="Move-out" sub="Empty home, deposit-grade" badge="+80% time"/>
                  </div>
                  {cleaningType === 'Standard Cleaning' && (
                    <div className="mt-4 pt-4 border-t border-stone-100">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Frequency</div>
                      <div className="flex flex-wrap gap-2">
                        {CLEAN_FREQUENCIES.map(f => (
                          <S0Pill key={f} active={frequency === f} onClick={() => setFrequency(f)}
                            sub={f !== 'One-time' ? `−${Math.round((1 - FREQ_MULTIPLIER[f]) * 100)}%` : undefined}>
                            {f}
                          </S0Pill>
                        ))}
                      </div>
                    </div>
                  )}
                </S0Card>

                {/* Card 3: House condition */}
                <S0Card num="3" title="House condition" sub="Be honest — it helps us match the right cleaner.">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                      { v: 'Pristine',         l: 'Pristine', s: 'Looks staged',    level: 1 },
                      { v: 'Normal',           l: 'Normal',   s: 'Lived-in',        level: 2 },
                      { v: 'Moderately Dirty', l: 'Dirty',    s: 'Needs attention', level: 3 },
                      { v: 'Heavily Soiled',   l: 'Heavy',    s: 'Major build-up',  level: 4 },
                    ] as const).map(({ v, l, s, level }) => (
                      <S0ConditionTile key={v} active={houseCondition === v} onClick={() => setHouseCondition(v)}
                        label={l} sub={s} level={level}/>
                    ))}
                  </div>
                </S0Card>

                {/* Card 4: Lifestyle */}
                <S0Card num="4" title="Lifestyle" sub="A couple quick details that affect the time needed.">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Pets at home</div>
                      <div className="flex gap-2 flex-wrap">
                        <S0Pill active={petLevel === 'none'}  onClick={() => setPetLevel('none')}>None</S0Pill>
                        <S0Pill active={petLevel === 'one'}   onClick={() => setPetLevel('one')}   sub="+20 min">1 pet</S0Pill>
                        <S0Pill active={petLevel === 'multi'} onClick={() => setPetLevel('multi')} sub="+40 min">2+ pets</S0Pill>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">How often do you cook?</div>
                      <div className="flex gap-2 flex-wrap">
                        <S0Pill active={cookingLevel === 'rare'}   onClick={() => setCookingLevel('rare')}>Rarely</S0Pill>
                        <S0Pill active={cookingLevel === 'weekly'} onClick={() => setCookingLevel('weekly')} sub="+15 min">Weekly</S0Pill>
                        <S0Pill active={cookingLevel === 'daily'}  onClick={() => setCookingLevel('daily')}  sub="+30 min">Daily</S0Pill>
                      </div>
                    </div>
                  </div>
                </S0Card>

                {/* Card 5: Add-on tasks */}
                <S0Card num="5" title="Add-on tasks" sub="Optional — each adds flat time to the estimate.">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {EXTRAS.map(e => {
                      const locked = isMoveOut && MOVEOUT_LOCKED_EXTRAS.includes(e.id);
                      return (
                        <S0ExtraTile key={e.id} active={extras.includes(e.id)} locked={locked}
                          onClick={() => { if (!locked) toggleExtra(e.id); }}
                          label={e.label} time={`+${EXTRA_MINS[e.hours]} min`}/>
                      );
                    })}
                  </div>
                  {isMoveOut && (
                    <p className="text-xs text-brand-600 mt-3">Oven, fridge &amp; windows included in every Move-Out clean.</p>
                  )}
                </S0Card>

                {/* CTA */}
                <div className="flex gap-3">
                  <button type="button" onClick={() => window.history.back()}
                    className="px-5 py-3.5 rounded-xl border border-stone-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0">
                    ← Back
                  </button>
                  <button type="button" onClick={goToStep1}
                    className="btn-primary flex-1 py-3.5 text-base flex items-center justify-center gap-2">
                    Continue to room photos <span className="text-lg">→</span>
                  </button>
                </div>
                {!isAuthenticated && (
                  <p className="text-xs text-center text-gray-400 -mt-2">
                    Photo analysis requires a free Google sign-in — you'll be prompted in the next step.
                  </p>
                )}
              </div>

              {/* RIGHT: Sticky sidebar */}
              <div className="hidden lg:flex flex-col gap-3 sticky top-6">
                {/* Live estimate card */}
                <div className="rounded-2xl p-6 text-white"
                  style={{ background: 'linear-gradient(165deg, #1F6E64 0%, #17524B 100%)', boxShadow: '0 18px 38px rgba(31,110,100,0.25)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-bold tracking-widest opacity-85 uppercase">Live Estimate</div>
                    <span className="text-[10px] px-2 py-1 rounded-full font-bold"
                      style={{ background: 'rgba(212,169,58,0.22)', color: '#D4A93A' }}>FORMULA</span>
                  </div>
                  <div className="flex items-baseline gap-2 my-1">
                    <span style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-5xl font-semibold leading-none tracking-tight">
                      {onSite.toFixed(1)}
                    </span>
                    <span className="text-lg opacity-80 font-medium">hrs</span>
                  </div>
                  <div className="text-sm opacity-75 mb-4">{cleaners} cleaner{cleaners > 1 ? 's' : ''} on site</div>
                  <div className="flex items-baseline justify-between pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}>
                    <span className="text-xs opacity-70">Price range</span>
                    <span style={{ fontFamily: 'Fraunces, Georgia, serif', color: '#D4A93A' }} className="text-2xl font-semibold">
                      ${priceMin}–${priceMax}
                    </span>
                  </div>
                  <div className="text-[11px] opacity-55 mt-2">AI tightens this range after photo review.</div>
                </div>

                {/* Inputs summary */}
                <div className="bg-white rounded-2xl p-4 border border-stone-200">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Your inputs</div>
                  {[
                    ['Layout', `${bedrooms} bed · ${bathrooms} bath · ${sqft} sq ft · ${livingSpaces} living`],
                    ['Type', cleaningType.replace(' Cleaning', '').replace('/Move-In', '')],
                    ['Condition', condLabel[houseCondition] ?? houseCondition],
                    ['Pets', petLevel === 'none' ? 'None' : petLevel === 'one' ? '1 pet' : '2+ pets'],
                    ['Cooking', cookingLevel === 'rare' ? 'Rarely' : cookingLevel === 'weekly' ? 'Weekly' : 'Daily'],
                    ...(extras.length > 0 ? [['Add-ons', `${extras.length} task${extras.length > 1 ? 's' : ''}`] as const] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1.5 text-sm border-b border-stone-100 last:border-0">
                      <span className="text-gray-400">{k}</span>
                      <span className="font-semibold text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Trust strip */}
                <div className="bg-white rounded-2xl p-4 border border-stone-200 flex gap-3">
                  <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'rgba(31,110,100,0.1)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M12 3L20 6V12C20 17 16 20.5 12 22C8 20.5 4 17 4 12V6Z" stroke="#1F6E64" strokeWidth="1.8" strokeLinejoin="round"/>
                      <path d="M8.5 12.5L11 15L16 10" stroke="#1F6E64" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-800 mb-0.5">No card, no commitment</div>
                    <div className="text-[11px] text-gray-400 leading-relaxed">
                      Free cancellation up to 24 h before your booking. Photos auto-deleted after analysis.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════ STEP 1: Room Photos ═══════════════ */}
      {step === 1 && (
        <>
          {/* ── Compact header ──────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold tracking-widest text-brand-600 uppercase mb-1">
                Free Calgary Estimate · Step 2 of 3
              </div>
              <h1 style={{ fontFamily: 'Fraunces, Georgia, serif' }}
                className="text-2xl sm:text-3xl font-medium text-gray-900 tracking-tight leading-tight m-0">
                Snap a few photos for your AI estimate
              </h1>
            </div>
            {/* Inline step indicator — desktop only */}
            <div className="hidden sm:flex items-center gap-0 flex-shrink-0 mt-1">
              {([
                { n: 1, l: 'Home', done: true, active: false },
                { n: 2, l: 'Photos', done: false, active: true },
                { n: 3, l: 'Results', done: false, active: false },
              ]).map((s, i, arr) => (
                <div key={s.n} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <button type="button"
                      onClick={() => handleStepClick(i)}
                      disabled={i > maxStep || (i === 2 && !aiResult)}
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                        ${s.done ? 'bg-brand-600 text-white' : s.active ? 'bg-brand-700 text-white ring-4 ring-brand-200' : 'bg-gray-200 text-gray-500'}
                        disabled:cursor-default`}>
                      {s.done ? '✓' : s.n}
                    </button>
                    <span className={`text-[10px] mt-1 font-medium whitespace-nowrap
                      ${s.active ? 'text-brand-700' : s.done ? 'text-brand-500' : 'text-gray-400'}`}>
                      {s.l}
                    </span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className={`h-0.5 w-8 mx-1 mb-4 ${i === 0 ? 'bg-brand-600' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Refine chip bar ─────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold tracking-widest text-brand-600 uppercase mr-1">Your Home</span>
                {[
                  { label: 'Type', value: cleaningType.replace(' Cleaning', '').replace('/Move-In', '') },
                  { label: 'Beds', value: String(bedrooms) },
                  { label: 'Baths', value: String(bathrooms) },
                  { label: 'Sq ft', value: String(sqft) },
                  { label: 'Condition', value: houseCondition.split(' ')[0] },
                  ...(frequency !== 'One-time' ? [{ label: 'Freq', value: frequency }] : []),
                  ...(pets ? [{ label: 'Pets', value: 'Yes' }] : []),
                  ...(extras.length > 0 ? [{ label: 'Extras', value: `+${extras.length}` }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-stone-200 rounded-full text-xs">
                    <span className="text-gray-400 font-medium">{label}</span>
                    <span className="font-semibold text-gray-800">{value}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setRefineOpen(o => !o)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1.5 flex-shrink-0
                  ${refineOpen
                    ? 'bg-brand-700 text-white border-brand-700'
                    : 'text-brand-700 border-brand-700 hover:bg-brand-50'}`}>
                {refineOpen ? 'Hide' : 'Refine'}
                <span className={`text-[9px] inline-block transition-transform ${refineOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>
            </div>

            {refineOpen && (
              <div className="px-4 pb-5 pt-1 border-t border-stone-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-4">
                  {/* Cleaning type */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Cleaning type</div>
                    <div className="flex flex-wrap gap-1.5">
                      {CLEANING_TYPES.map(t => (
                        <button key={t} type="button" onClick={() => setCleaningType(t)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors
                            ${cleaningType === t ? 'bg-brand-50 border-brand-600 text-brand-800' : 'bg-white border-gray-200 text-gray-700 hover:border-brand-300'}`}>
                          {t.replace(' Cleaning', '').replace('/Move-In', '')}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Frequency */}
                  {(cleaningType === 'Standard Cleaning' || cleaningType === 'Deep Cleaning') && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Frequency</div>
                      <div className="flex flex-wrap gap-1.5">
                        {CLEAN_FREQUENCIES.map(f => (
                          <button key={f} type="button" onClick={() => setFrequency(f)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors
                              ${frequency === f ? 'bg-brand-50 border-brand-600 text-brand-800' : 'bg-white border-gray-200 text-gray-700 hover:border-brand-300'}`}>
                            {f}
                            {f !== 'One-time' && (
                              <span className={`ml-1 text-[10px] ${frequency === f ? 'text-brand-600' : 'text-gray-400'}`}>
                                −{Math.round((1 - FREQ_MULTIPLIER[f]) * 100)}%
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Condition */}
                  {cleaningType !== 'Short-Term Rental Turnover' && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Condition</div>
                      <div className="flex flex-wrap gap-1.5">
                        {HOUSE_CONDITIONS.map(c => (
                          <button key={c} type="button" onClick={() => setHouseCondition(c)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors
                              ${houseCondition === c ? 'bg-brand-50 border-brand-600 text-brand-800' : 'bg-white border-gray-200 text-gray-700 hover:border-brand-300'}`}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Pets */}
                  {cleaningType !== 'Short-Term Rental Turnover' && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Pets</div>
                      <div className="flex gap-1.5">
                        {(['No', 'Yes'] as const).map(opt => (
                          <button key={opt} type="button" onClick={() => setPets(opt === 'Yes')}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors
                              ${(opt === 'Yes') === pets ? 'bg-brand-50 border-brand-600 text-brand-800' : 'bg-white border-gray-200 text-gray-700 hover:border-brand-300'}`}>
                            {opt}{opt === 'Yes' && <span className="ml-1 text-[10px] text-gray-400">+30 min</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Extras — full width */}
                  {cleaningType !== 'Short-Term Rental Turnover' && (
                    <div className="sm:col-span-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                        Add-on tasks
                        {isMoveOut && <span className="ml-2 text-brand-600 normal-case">oven, fridge &amp; windows included</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {EXTRAS.map(e => {
                          const active = extras.includes(e.id);
                          const locked = MOVEOUT_LOCKED_EXTRAS.includes(e.id);
                          return (
                            <button key={e.id} type="button"
                              onClick={() => !locked && toggleExtra(e.id)}
                              disabled={locked}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer
                                ${active ? 'bg-brand-50 border-brand-600 text-brand-800' : 'bg-white border-gray-200 text-gray-700 hover:border-brand-300'}
                                disabled:opacity-60 disabled:cursor-default`}>
                              {e.label}
                              <span className={`ml-1 text-[10px] ${active ? 'text-brand-600' : 'text-gray-400'}`}>
                                +{EXTRA_MINS[e.hours]}m
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Beds / Baths / Sqft steppers */}
                  <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                    {([
                      { label: 'Bedrooms', value: bedrooms, setValue: setBedrooms, min: 0, max: 8, s: 1 },
                      { label: 'Bathrooms', value: bathrooms, setValue: setBathrooms, min: 0, max: 6, s: 0.5 },
                      { label: 'Sq ft', value: sqft, setValue: setSqft, min: 400, max: 5000, s: 100 },
                    ] as const).map(({ label, value, setValue, min, max, s }) => (
                      <div key={label}>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{label}</div>
                        <div className="flex items-center justify-between gap-1 p-1.5 border border-stone-200 rounded-xl bg-white">
                          <button type="button" onClick={() => setValue(Math.max(min, value - s) as any)}
                            className="w-7 h-7 rounded-lg bg-amber-50 text-gray-700 flex items-center justify-center text-sm hover:bg-stone-100 transition-colors">
                            −
                          </button>
                          <span style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-sm font-semibold text-gray-900">
                            {value}
                          </span>
                          <button type="button" onClick={() => setValue(Math.min(max, value + s) as any)}
                            className="w-7 h-7 rounded-lg bg-brand-700 text-white flex items-center justify-center text-sm hover:bg-brand-800 transition-colors">
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Move-out vacancy reminder ────────────────────────────────────────── */}
          {cleaningType.toLowerCase().includes('move') && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-blue-500 text-lg shrink-0 mt-0.5">🏠</span>
              <div>
                <p className="font-semibold text-blue-800 text-sm">Rooms should be fully empty</p>
                <p className="text-blue-700 text-xs mt-0.5 leading-relaxed">
                  Move-Out/Move-In cleaning is designed for vacant properties. Please photograph rooms after all furniture and belongings have been removed.
                </p>
              </div>
            </div>
          )}

          {/* ── Auth gate ────────────────────────────────────────────────────────── */}
          {!isAuthenticated ? (
            <div className="card text-center space-y-3">
              <p className="text-sm text-gray-600">Sign in to upload photos and get an AI-powered estimate.</p>
              <button onClick={() => { saveFormState(); sessionStorage.setItem('authReturnTo', window.location.pathname); window.location.href = buildGoogleAuthUrl(); }}
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
              {/* Mobile live estimate strip */}
              <div className="lg:hidden rounded-2xl p-3 flex items-center justify-between text-white"
                style={{ background: 'linear-gradient(135deg, #1F6E64, #17524B)' }}>
                <div>
                  <div className="text-[9px] font-bold tracking-widest opacity-80 uppercase">Live Estimate</div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-xl font-semibold">
                      {one}–{oneMax}h
                    </span>
                    <span className="text-xs opacity-75">· {one > 5 ? '2 cleaners' : '1 cleaner'}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-bold tracking-widest opacity-80 uppercase">Price</div>
                  <div style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-base font-semibold text-amber-300">
                    ${Math.round(one * getRate(cleaningType, frequency))}–${Math.round(oneMax * getRate(cleaningType, frequency))}
                  </div>
                </div>
              </div>

              {/* ── Two-column grid ────────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">

                {/* ── LEFT: Photo capture panel ──────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-5">

                  {/* Active room label + tips toggle */}
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-1">Now capturing</div>
                        <div style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-2xl font-semibold text-gray-900 leading-tight">
                          {activeRoom ?? rooms[0] ?? 'Select a room'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {isTouchDevice ? 'Live camera auto-captures · tap shutter anytime' : 'Click the shutter to open your camera · or upload from gallery'}
                        </div>
                      </div>
                      <button type="button" onClick={() => setTipsOpen(o => !o)}
                        className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 flex-shrink-0 ml-4
                          ${tipsOpen ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-stone-200 text-gray-500 hover:bg-gray-50'}`}>
                        <span className="w-4 h-4 rounded-full bg-amber-50 text-[10px] font-bold flex items-center justify-center">?</span>
                        {tipsOpen ? 'Hide tips' : 'How it works'}
                      </button>
                    </div>

                    {tipsOpen && (
                      <div className="mt-3 p-4 rounded-xl text-sm leading-relaxed" style={{ background: '#F3EDDD' }}>
                        <ol className="space-y-1.5 list-none text-xs text-gray-700">
                          <li><span className="font-semibold text-brand-700">1.</span> Point at the room — the gold ring fills as the AI auto-captures.</li>
                          <li><span className="font-semibold text-brand-700">2.</span> Or tap the shutter button to capture manually.</li>
                          <li><span className="font-semibold text-brand-700">3.</span> Move to a different angle and repeat — aim for 2–5 photos per room.</li>
                          <li><span className="font-semibold text-brand-700">4.</span> Tap the next room in the dock below when done.</li>
                        </ol>
                        <p className="text-[11px] text-gray-400 mt-2 pt-2" style={{ borderTop: '1px solid #E6E1D3' }}>
                          💡 Live phone camera gives sharper detail than uploaded photos.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Camera viewport */}
                  {(() => {
                    const currentRoom = activeRoom ?? rooms[0];
                    const photoCount = currentRoom ? (roomPhotos[currentRoom] ?? []).filter(p => p.s3Key !== null).length : 0;
                    const target = MIN_PHOTOS_PER_ROOM;
                    const pct = Math.min(1, photoCount / target);
                    const r = 55, circ = 2 * Math.PI * r;
                    return (
                      <div className="rounded-2xl overflow-hidden relative bg-[#0F1A18] flex items-center justify-center"
                        style={{ aspectRatio: '16 / 10' }}>
                        {/* Subtle grid */}
                        <div className="absolute inset-0" style={{
                          backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 12px)',
                        }}/>
                        {/* Progress ring */}
                        <div className="relative flex items-center justify-center z-10">
                          <div className="w-36 h-36 rounded-full border-2 flex items-center justify-center"
                            style={{ borderColor: 'rgba(212,169,58,0.7)' }}>
                            <div className="w-28 h-28 rounded-full flex items-center justify-center"
                              style={{ background: 'rgba(212,169,58,0.15)' }}>
                              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                                <path d="M3 9C3 7.9 3.9 7 5 7H8L9.5 5H14.5L16 7H19C20.1 7 21 7.9 21 9V18C21 19.1 20.1 20 19 20H5C3.9 20 3 19.1 3 18Z" stroke="#D4A93A" strokeWidth="1.8" strokeLinejoin="round"/>
                                <circle cx="12" cy="13" r="4" stroke="#D4A93A" strokeWidth="1.8"/>
                              </svg>
                            </div>
                          </div>
                          <svg width="144" height="144" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
                            <circle cx="72" cy="72" r={r} fill="none" stroke="#D4A93A" strokeWidth="2.5"
                              strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"/>
                          </svg>
                        </div>
                        {/* Live status pill */}
                        <div className="absolute top-4 left-4 rounded-full px-3 py-1.5 flex items-center gap-2 text-xs text-white font-medium"
                          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
                          {isTouchDevice
                            ? <><span className="w-2 h-2 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px #4ade80' }}/> Live · auto-captures when steady</>
                            : <><span className="w-2 h-2 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px #4ade80' }}/> Click shutter to open camera</>}
                        </div>
                        {/* Count badge */}
                        <div className="absolute top-4 right-4 rounded-xl px-3 py-2 text-white"
                          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
                          <div className="text-[10px] opacity-70 uppercase tracking-wide">This room</div>
                          <div style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-lg font-semibold">{photoCount} / {target}</div>
                        </div>
                        {/* Shutter button — always shown; opens live camera on all devices */}
                        <button type="button" disabled={uploading}
                          onClick={() => { const rm = activeRoom ?? rooms[0]; if (rm) openCamera(rm); }}
                          className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border-4 bg-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50"
                          style={{ borderColor: 'rgba(255,255,255,0.4)' }}>
                          <div className="w-12 h-12 rounded-full bg-white border-2 border-gray-900"/>
                        </button>
                        {/* Upload from gallery — left side */}
                        <button type="button" data-testid="gallery-upload-btn" disabled={uploading}
                          onClick={() => { const rm = activeRoom ?? rooms[0]; if (rm) openFilePicker(rm); }}
                          className="absolute bottom-5 left-4 rounded-xl text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', padding: '9px 12px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="4" width="18" height="16" rx="2" stroke="white" strokeWidth="1.8"/>
                            <circle cx="8.5" cy="9.5" r="1.5" stroke="white" strokeWidth="1.8"/>
                            <path d="M3 17L9 12L13 16L17 13L21 17" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                          </svg>
                          Upload
                        </button>
                        {/* QR — right side, desktop only */}
                        {!isTouchDevice && (
                          <button type="button" onClick={() => setNudgeDismissed(false)}
                            className="absolute bottom-5 right-4 rounded-xl text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', padding: '9px 12px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <rect x="3" y="3" width="7" height="7" rx="1" stroke="white" strokeWidth="1.8"/>
                              <rect x="14" y="3" width="7" height="7" rx="1" stroke="white" strokeWidth="1.8"/>
                              <rect x="3" y="14" width="7" height="7" rx="1" stroke="white" strokeWidth="1.8"/>
                              <path d="M14 14H17V17H14ZM19 14H21M14 19H17M19 17V21" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                            </svg>
                            Phone
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* QR nudge — shown when "Continue on phone" is clicked */}
                  {!isTouchDevice && !nudgeDismissed && (
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <Suspense fallback={<div className="w-16 h-16 bg-gray-100 rounded shrink-0"/>}>
                        <QRCodeSVG value={window.location.href} size={64} className="shrink-0 rounded"/>
                      </Suspense>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-amber-800 text-sm">Scan to continue on your phone</p>
                        <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                          Live camera gives the AI much better detail than uploaded photos.
                        </p>
                      </div>
                      <button type="button" onClick={() => setNudgeDismissed(true)} aria-label="Dismiss"
                        className="text-amber-400 hover:text-amber-700 text-xl leading-none shrink-0 transition-colors">×</button>
                    </div>
                  )}

                  {/* ── Room dock ─────────────────────────────────────────────────── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Rooms to capture</div>
                      <div className="flex gap-2">
                        {[
                          { id: 'kitchen', label: 'Kitchen',     value: includeKitchen,    set: setIncludeKitchen },
                          { id: 'living',  label: 'Living Room', value: includeLivingRoom, set: setIncludeLivingRoom },
                        ].map(({ id, label, value, set }) => (
                          <button key={id} type="button" data-testid={`toggle-${id}`} onClick={() => {
                            set((v: boolean) => !v);
                            const newRoomList = buildRoomList(
                              bedrooms, bathrooms, extras,
                              id === 'kitchen' ? !value : includeKitchen,
                              id === 'living'  ? !value : includeLivingRoom,
                            );
                            setRooms(newRoomList);
                            setRoomPhotos(prev => {
                              const next: Record<string, typeof prev[string]> = {};
                              for (const rm of newRoomList) next[rm] = prev[rm] ?? [];
                              return next;
                            });
                          }}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors
                              ${value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                            {value ? '✓ ' : '+ '}{label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {rooms.map(room => {
                        const photos  = roomPhotos[room] ?? [];
                        const ready   = photos.filter(p => p.s3Key !== null).length;
                        const isActive = (activeRoom ?? rooms[0]) === room;
                        const done    = ready >= 2;
                        return (
                          <button key={room} type="button"
                            ref={el => { roomRefsMap.current[room] = el as unknown as HTMLDivElement; }}
                            onClick={() => setActiveRoom(room)}
                            className={`flex-shrink-0 min-w-[120px] p-3 rounded-xl text-left border transition-colors
                              ${isActive
                                ? 'bg-brand-700 text-white border-brand-700'
                                : done
                                  ? 'bg-white text-gray-800 border-brand-200'
                                  : 'bg-white text-gray-700 border-gray-200 hover:border-brand-200'}`}
                            style={{ borderWidth: '1.5px' }}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold">{room}</span>
                              {done && (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                  <path d="M4 12.5L10 18L20 7" stroke={isActive ? 'white' : '#1F6E64'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <div className="flex gap-1 mb-1">
                              {Array.from({ length: MIN_PHOTOS_PER_ROOM }).map((_, i) => (
                                <div key={i} className={`flex-1 h-1 rounded-full ${
                                  i < ready
                                    ? (isActive ? 'bg-amber-300' : 'bg-amber-400')
                                    : (isActive ? 'bg-white/25' : 'bg-gray-100')
                                }`}/>
                              ))}
                            </div>
                            <div className="text-[10px] opacity-60">{ready}/{MIN_PHOTOS_PER_ROOM} min</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Thumbnails for the active room */}
                  {(() => {
                    const currentRoom = activeRoom ?? rooms[0];
                    if (!currentRoom) return null;
                    const photos = roomPhotos[currentRoom] ?? [];
                    const canAdd = photos.length < MAX_PER_ROOM;
                    if (photos.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-2">
                        {photos.map((p, i) => (
                          <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                            <img src={p.preview} alt={`${currentRoom} ${i + 1}`} className="h-full w-full object-cover"/>
                            {p.s3Key === null && !p.failed && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Spinner size="sm"/></div>
                            )}
                            {p.failed && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => retryPhoto(currentRoom, i)}
                                  className="absolute inset-0 bg-red-600/85 flex flex-col items-center justify-center text-white gap-0.5 hover:bg-red-600 transition-colors"
                                  title="Upload failed — tap to retry"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                    <path d="M1 4v6h6M23 20v-6h-6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <span className="text-[9px] font-semibold leading-none">Retry</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removePhoto(currentRoom, i)}
                                  className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center hover:bg-black z-10"
                                  title="Remove"
                                >×</button>
                              </>
                            )}
                            {p.s3Key !== null && (
                              <button onClick={() => removePhoto(currentRoom, i)}
                                className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-600">
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        {canAdd && (
                          <button type="button" onClick={() => openFilePicker(currentRoom)} disabled={uploading}
                            className="h-16 w-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors flex-shrink-0 text-xl disabled:opacity-50">
                            +
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {uploadError  && <p className="text-xs text-red-600">{uploadError}</p>}
                  {analyzeError && <p className="text-xs text-red-600">{analyzeError}</p>}

                  {/* Coverage review panel */}
                  {showReview && (() => {
                    const missing = rooms.filter(r => !(roomPhotos[r] ?? []).some(p => p.s3Key !== null));
                    return (
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                        <p className="text-sm font-semibold text-gray-800">Review your coverage</p>
                        <div className="space-y-1.5">
                          {rooms.map(r => {
                            const count = (roomPhotos[r] ?? []).filter(p => p.s3Key !== null).length;
                            const ok = count > 0;
                            return (
                              <div key={r} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`text-base ${ok ? 'text-green-500' : 'text-amber-500'}`}>{ok ? '✅' : '⚠️'}</span>
                                  <span className={`text-sm ${ok ? 'text-gray-700' : 'text-amber-700 font-medium'}`}>{r}</span>
                                </div>
                                <span className="text-xs text-gray-400">{ok ? `${count} photo${count !== 1 ? 's' : ''}` : 'no photos'}</span>
                              </div>
                            );
                          })}
                        </div>
                        {missing.length > 0 && (
                          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                            The AI works best with photos of every room. Missing rooms will be estimated from your home details only.
                          </p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button type="button" onClick={() => {
                            setShowReview(false);
                            if (missing.length > 0) {
                              setActiveRoom(missing[0]);
                              setTimeout(() => {
                                roomRefsMap.current[missing[0]]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 50);
                            }
                          }}
                            className="flex-none px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            {missing.length > 0 ? 'Add missing photos' : 'Go back'}
                          </button>
                          <button type="button" onClick={() => { setShowReview(false); handleAnalyze(); }}
                            disabled={!canAnalyze || analyzing}
                            className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 text-sm">
                            {missing.length > 0 ? 'Analyse anyway' : `Analyse ${totalReady} photos with AI`}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Back + Analyse CTA */}
                  {!showReview && (
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setStep(0)}
                        className="px-4 py-3 rounded-xl border border-stone-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0">
                        ← Back to home details
                      </button>
                      <button type="button" onClick={() => setShowReview(true)}
                        disabled={!canAnalyze || analyzing}
                        className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                        {analyzing
                          ? <><Spinner size="sm"/> Analysing rooms…</>
                          : <>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                                <path d="M12 3L13.5 10.5L21 12L13.5 13.5L12 21L10.5 13.5L3 12L10.5 10.5Z" fill="white"/>
                              </svg>
                              {canAnalyze
                                ? `Analyse ${totalReady} photo${totalReady !== 1 ? 's' : ''} with AI →`
                                : `${rooms.length - roomsReady} room${rooms.length - roomsReady === 1 ? '' : 's'} still need ${MIN_PHOTOS_PER_ROOM} photos`}
                            </>}
                      </button>
                    </div>
                  )}

                  {analyzing && (
                    <p className="text-xs text-gray-400 text-center">AI is analysing each room… this usually takes 15–30 seconds.</p>
                  )}

                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/heic,image/heif"
                    multiple onChange={handleFileChange} className="hidden"/>

                  {cameraRoom && (
                    <CameraCapture
                      roomName={cameraRoom}
                      cleaningType={cleaningType}
                      maxCaptures={cameraMaxCaptures}
                      isLastRoom={rooms.indexOf(cameraRoom) === rooms.length - 1}
                      onCapture={file => handleCameraCapture(cameraRoom, file)}
                      onClose={() => setCameraRoom(null)}
                    />
                  )}
                </div>

                {/* ── RIGHT: Sticky estimate sidebar ───────────────────────────── */}
                <div className="hidden lg:flex flex-col gap-3 sticky top-6">
                  {/* Live estimate card */}
                  {(() => {
                    const rate     = getRate(cleaningType, frequency);
                    const priceMin = Math.round(one * rate);
                    const priceMax = Math.round(oneMax * rate);
                    const cleaners = one > 5 ? 2 : 1;
                    const onSite   = cleaners === 2 ? one / 2 : one;
                    return (
                      <div className="rounded-2xl p-6 text-white"
                        style={{ background: 'linear-gradient(180deg, #1F6E64 0%, #17524B 100%)', boxShadow: '0 20px 40px rgba(31,110,100,0.22)' }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-[10px] font-bold tracking-widest opacity-80 uppercase">Live Estimate</div>
                          <span className="text-[10px] px-2 py-1 rounded-full font-bold"
                            style={{ background: 'rgba(212,169,58,0.22)', color: '#D4A93A' }}>FORMULA</span>
                        </div>
                        <div className="flex items-baseline gap-2 my-1">
                          <span style={{ fontFamily: 'Fraunces, Georgia, serif' }} className="text-5xl font-semibold leading-none tracking-tight">
                            {onSite.toFixed(1)}
                          </span>
                          <span className="text-lg opacity-80 font-medium">hrs</span>
                        </div>
                        <div className="text-sm opacity-75 mb-4">{cleaners} cleaner{cleaners > 1 ? 's' : ''} on site</div>
                        <div className="flex items-baseline justify-between pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}>
                          <span className="text-xs opacity-70">Price range</span>
                          <span style={{ fontFamily: 'Fraunces, Georgia, serif', color: '#D4A93A' }} className="text-2xl font-semibold">
                            ${priceMin}–${priceMax}
                          </span>
                        </div>
                        <div className="text-[11px] opacity-55 mt-2">Updates as you refine. AI tightens the range after photo review.</div>
                      </div>
                    );
                  })()}

                  {/* Photo progress card */}
                  <div className="bg-white rounded-2xl p-4 border border-stone-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-800">{roomsReady} / {rooms.length} rooms ready</span>
                      <span className={`text-xs font-semibold ${canAnalyze ? 'text-green-600' : 'text-gray-400'}`}>
                        {canAnalyze ? '✓ Ready' : `${rooms.length - roomsReady} to go`}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F3EDDD' }}>
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${rooms.length > 0 ? Math.min(100, (roomsReady / rooms.length) * 100) : 0}%`,
                          background: 'linear-gradient(90deg, #1F6E64, #D4A93A)',
                        }}/>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                      {rooms.length === 1 ? '2 photos min to analyse' : `${MIN_PHOTOS_PER_ROOM} photos min per room`} · up to {MAX_PER_ROOM} per room · JPEG/PNG · 10 MB each
                    </div>
                  </div>

                  {/* Privacy strip */}
                  <div className="bg-white rounded-2xl p-4 border border-stone-200">
                    <div className="flex items-center gap-2 mb-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M12 3L20 6V12C20 17 16 20.5 12 22C8 20.5 4 17 4 12V6Z" stroke="#1F6E64" strokeWidth="1.8" strokeLinejoin="round"/>
                        <path d="M8.5 12.5L11 15L16 10" stroke="#1F6E64" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="text-xs font-semibold text-gray-800">Photos used only for estimating</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Never shown to maids without your permission.
                    </p>
                  </div>
                </div>
              </div>
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
            {(() => {
              const aiOneMax = roundHours(aiResult.oneCleanerHours * NEWBIE_MULTIPLIER);
              const aiTwoMax = roundHours(aiResult.twoCleanerHours * NEWBIE_MULTIPLIER);
              return (
                <div className={`grid gap-3 mb-4 ${aiResult.oneCleanerHours <= 5 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div className="bg-brand-600 rounded-xl p-3 text-center text-white">
                    <div className="text-2xl font-bold">{aiResult.oneCleanerHours}–{aiOneMax} hrs</div>
                    <div className="text-brand-200 text-xs mt-0.5">1 Cleaner</div>
                  </div>
                  {aiResult.oneCleanerHours > 5 && (
                    <div className="bg-brand-600 rounded-xl p-3 text-center text-white">
                      <div className="text-2xl font-bold">{aiResult.twoCleanerHours}–{aiTwoMax} hrs</div>
                      <div className="text-brand-200 text-xs mt-0.5">2 Cleaners</div>
                    </div>
                  )}
                </div>
              );
            })()}
            <p className="text-sm text-gray-700">{aiResult.conditionAssessment}</p>
            {!aiResult.matchesSelfReport && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                Self-reported condition ({houseCondition}) was adjusted based on what the AI observed in the photos.
              </p>
            )}
          </div>

          {/* Upgrade comparison — Option C stacked cards */}
          {aiResult.upgradeRecommendation ? (() => {
            const upgrade    = aiResult.upgradeRecommendation!;
            const upgradeType = upgrade.suggestedType as CleaningType;
            const upgradeResult = calcHours(bedrooms, bathrooms, sqft, upgradeType, houseCondition, pets, cookingFreq, cookingStyle, extras, frequency);
            const upgradeHours    = upgradeResult.one;
            const upgradeHoursMax = upgradeResult.oneMax;

            // 4 representative standard tasks from checklist
            const stdTypeKey: 'standard' | 'deep' | 'moveout' =
              cleaningType.includes('Move') ? 'moveout' : cleaningType.includes('Deep') ? 'deep' : 'standard';
            const stdTasks = CLEANING_CHECKLIST
              .flatMap(r => r.items.filter(i => i.includedIn.includes(stdTypeKey) && i.priority === 'high'))
              .slice(0, 4)
              .map(i => i.task);

            return (
              <div className="space-y-0">
                {/* Current plan card */}
                <div className="card border-2 border-gray-200 rounded-b-none border-b-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Your current plan</p>
                      <p className="font-semibold text-gray-900">{cleaningType}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">{aiResult.oneCleanerHours}–{roundHours(aiResult.oneCleanerHours * NEWBIE_MULTIPLIER)} hrs</p>
                      <p className="text-xs text-gray-400">1 cleaner</p>
                    </div>
                  </div>
                  <ul className="space-y-1.5 mb-4">
                    {stdTasks.map(t => (
                      <li key={t} className="flex items-start gap-2 text-xs text-gray-600">
                        <span className="text-gray-400 mt-0.5 shrink-0">✓</span> {t}
                      </li>
                    ))}
                  </ul>
                  <button type="button"
                    onClick={() => { setCleaningType(cleaningType); navigate('/maids'); }}
                    className="w-full py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                    Book {cleaningType} →
                  </button>
                </div>

                {/* Connector */}
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-x-2 border-amber-400">
                  <span className="text-amber-500 text-xs">★</span>
                  <p className="text-xs text-amber-800 font-medium flex-1">{upgrade.reason}</p>
                  <span className="text-amber-500 text-xs">↓</span>
                </div>

                {/* Upgrade card */}
                <div className="card border-2 border-brand-400 bg-brand-50 rounded-t-none border-t-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-brand-600 uppercase tracking-wide font-medium">AI recommends</p>
                      <p className="font-semibold text-brand-900">{upgradeType}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-brand-800">{upgradeHours}–{upgradeHoursMax} hrs</p>
                      <p className="text-xs text-brand-400">1 cleaner</p>
                    </div>
                  </div>
                  <div className="mb-3">
                    <p className="text-xs text-brand-600 font-medium mb-1.5">Everything in {cleaningType}, plus:</p>
                    <ul className="space-y-1.5">
                      {upgrade.benefits.map(b => (
                        <li key={b} className="flex items-start gap-2 text-xs text-brand-800">
                          <span className="text-brand-500 mt-0.5 shrink-0 font-bold">+</span> {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button type="button"
                    onClick={() => { setCleaningType(upgradeType); navigate('/maids'); }}
                    className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors">
                    Book {upgradeType} →
                  </button>
                </div>
              </div>
            );
          })() : (
            /* No upgrade — show formula card only */
            <div className="card bg-gray-50 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Formula estimate (for comparison)</p>
              <div className={`grid gap-3 ${one <= 5 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div className="text-center">
                  <div className="text-xl font-bold text-gray-700">{one}–{oneMax} hrs</div>
                  <div className="text-xs text-gray-400">1 Cleaner</div>
                </div>
                {one > 5 && (
                  <div className="text-center">
                    <div className="text-xl font-bold text-gray-700">{two}–{twoMax} hrs</div>
                    <div className="text-xs text-gray-400">2 Cleaners</div>
                  </div>
                )}
              </div>
            </div>
          )}

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

              {/* Total row */}
              {(() => {
                const totalMin = aiResult.roomBreakdown.reduce((sum, r) => sum + r.estimatedMinutes, 0);
                const hrs = Math.floor(totalMin / 60);
                const min = totalMin % 60;
                const label = hrs > 0 && min > 0 ? `${hrs} hr ${min} min` : hrs > 0 ? `${hrs} hr` : `${min} min`;
                return (
                  <div className="flex items-center justify-between px-3 pt-2 mt-1 border-t border-gray-200">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total (base, before adjustments)</span>
                    <span className="text-sm font-bold text-gray-800">{label}</span>
                  </div>
                );
              })()}
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

          {/* Alpha tester feedback — shown after full results, before CTAs */}
          <AlphaFeedbackForm />

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
