import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const STABILITY_FRAMES = 50;   // ~1.7 s at ~30 fps before auto-capture fires
const DIFF_THRESHOLD   = 8;    // avg RGB diff per sampled pixel — below = "stable"
const SAMPLE_STRIDE    = 16;   // bytes between samples (every 4th pixel in RGBA data)
const PREVIEW_W        = 160;  // small canvas for diff computation
const PREVIEW_H        = 90;

const BRIGHTNESS_THRESHOLD = 45;  // avg luminance 0–255; below = "dark room"
const DARK_FRAMES_NEEDED   = 20;  // ~0.7s of consecutive dark frames before warning

const RING_R    = 36;
const RING_CIRC = 2 * Math.PI * RING_R;

// ─── Room-specific shot guides ────────────────────────────────────────────────

interface ShotItem { icon: string; label: string; hint: string; }

const ROOM_SHOTS: Record<string, ShotItem[]> = {
  'Kitchen:standard': [
    { icon: '🏠', label: 'Overview',        hint: 'Stand at the entrance — show the whole kitchen' },
    { icon: '🔥', label: 'Stovetop',        hint: 'Show burners, grates and surrounding surface from above' },
    { icon: '🚰', label: 'Sink & counters', hint: 'Show the sink, faucet and full counter surface' },
    { icon: '🧊', label: 'Fridge front',    hint: 'Capture the fridge exterior and the floor in front of it' },
  ],
  'Kitchen:deep': [
    { icon: '🏠', label: 'Overview',        hint: 'Stand at the entrance — show the whole kitchen' },
    { icon: '🔥', label: 'Stovetop',        hint: 'Show burners, grates and surrounding surface from above' },
    { icon: '🫙', label: 'Oven interior',   hint: 'Open the oven door — show racks, walls and floor of oven' },
    { icon: '🚰', label: 'Sink & counters', hint: 'Show the sink, faucet and full counter surface' },
    { icon: '🧊', label: 'Fridge interior', hint: 'Open the fridge — show shelves, drawers and walls (must be empty)' },
  ],
  Kitchen: [
    { icon: '🏠', label: 'Overview',        hint: 'Stand at the entrance — show the whole kitchen' },
    { icon: '🔥', label: 'Stovetop',        hint: 'Show burners, grates and surrounding surface from above' },
    { icon: '🫙', label: 'Oven interior',   hint: 'Open the oven door — show racks, walls and floor of oven' },
    { icon: '🚰', label: 'Sink & counters', hint: 'Show the sink, faucet and full counter surface' },
    { icon: '🧊', label: 'Fridge interior', hint: 'Open the fridge — show shelves, drawers and walls (must be empty)' },
  ],
  'Bathroom:standard': [
    { icon: '🚽', label: 'Toilet',          hint: 'Show the toilet, base, tank and floor around it' },
    { icon: '🛁', label: 'Shower / Tub',    hint: 'Capture the tub or shower, walls, tiles and fixtures' },
    { icon: '🪞', label: 'Vanity & mirror', hint: 'Show the sink, counter surface, mirror and cabinet' },
    { icon: '🪣', label: 'Floor',           hint: 'Capture the floor tiles and all corners of the room' },
  ],
  Bathroom: [
    { icon: '🚽', label: 'Toilet',          hint: 'Show the toilet, base, tank and floor around it — include behind the tank' },
    { icon: '🛁', label: 'Shower / Tub',    hint: 'Capture the tub or shower walls, tiles, grout lines and fixtures' },
    { icon: '🚿', label: 'Shower door',     hint: 'Show the shower door or curtain, tracks and any soap scum buildup' },
    { icon: '🪞', label: 'Vanity & mirror', hint: 'Show the sink, counter surface, mirror and cabinet interior' },
    { icon: '🪣', label: 'Floor & corners', hint: 'Capture the floor tiles, grout lines and all four corners' },
  ],
  Bedroom: [
    { icon: '🚪', label: 'Full room',       hint: 'Stand in the doorway — show the whole room ahead' },
    { icon: '🛏️', label: 'Bed area',        hint: 'Capture the bed, headboard and floor on both sides' },
    { icon: '👗', label: 'Closet',          hint: 'Open the closet — show the interior, shelves and floor' },
    { icon: '📐', label: 'Floor & corners', hint: 'Show floor, baseboards and all four corners' },
  ],
  'Living Room': [
    { icon: '🏠', label: 'Full room',       hint: 'Stand at the entrance — show the whole living space' },
    { icon: '🛋️', label: 'Seating area',    hint: 'Capture the couch, chairs, cushions and coffee table' },
    { icon: '🪟', label: 'Windows & floor', hint: 'Show windows, curtains/blinds and the floor beneath' },
    { icon: '📺', label: 'Feature wall',    hint: 'Capture the TV unit, shelving, fireplace or feature wall' },
  ],
  Basement: [
    { icon: '🏗️', label: 'Full space',      hint: 'Stand at the stairs — show the entire basement floor' },
    { icon: '🪨', label: 'Floor condition', hint: 'Capture the floor surface — show stains, cracks or damp' },
    { icon: '📦', label: 'Storage areas',   hint: 'Show any shelving, storage items or utility equipment' },
  ],
  Garage: [
    { icon: '🚗', label: 'Full garage',     hint: 'Stand at the entrance — show the complete garage space' },
    { icon: '🛞', label: 'Floor',           hint: 'Capture the floor — show oil stains, marks or debris' },
    { icon: '🗄️', label: 'Walls & storage', hint: 'Show shelving, walls, tools and any stored items' },
  ],
};

const ROOM_MIN_HINTS: Record<string, string> = {
  Kitchen:      'stovetop & counters',
  Bathroom:     'toilet & shower/tub',
  Bedroom:      'full room view & floor',
  'Living Room':'full room & seating area',
  Basement:     'full space & floor condition',
  Garage:       'full garage & floor',
};

function getRoomMinHint(roomName: string): string {
  const key = Object.keys(ROOM_MIN_HINTS).find(k => roomName.startsWith(k));
  return key ? ROOM_MIN_HINTS[key] : 'an overview and at least one detail shot';
}

function getShotGuide(roomName: string, cleaningType: string): ShotItem[] {
  const tier = cleaningType.includes('Move') || cleaningType.includes('Deep') ? 'deep' : 'standard';
  const tieredKey = `${roomName}:${tier}`;
  if (ROOM_SHOTS[tieredKey]) return ROOM_SHOTS[tieredKey];
  if (ROOM_SHOTS[roomName])  return ROOM_SHOTS[roomName];
  const baseKey = Object.keys(ROOM_SHOTS).find(k => !k.includes(':') && roomName.startsWith(k));
  if (baseKey) return ROOM_SHOTS[baseKey];
  // Generic fallback
  return [
    { icon: '👁️', label: 'Main view',   hint: 'Stand in the doorway — show the full room ahead' },
    { icon: '🧱', label: 'Far wall',    hint: 'Move across — capture the opposite wall & floor' },
    { icon: '⬅️', label: 'Left side',   hint: 'Turn left — show the left wall, windows & corners' },
    { icon: '➡️', label: 'Right side',  hint: 'Turn right — show the right wall, floor & ceiling' },
  ];
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  roomName:     string;
  cleaningType: string;
  maxCaptures:  number;
  isLastRoom:   boolean;
  onCapture:    (file: File) => void;
  onClose:      () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CameraCapture({ roomName, cleaningType, maxCaptures, isLastRoom, onCapture, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // rAF-loop refs — avoid stale closures
  const stableRef    = useRef(0);
  const prevRef      = useRef<Uint8ClampedArray | null>(null);
  const capturingRef = useRef(false);
  const countRef     = useRef(0);
  const angleIdxRef  = useRef(0);
  const maxRef       = useRef(maxCaptures);
  const onCaptureRef = useRef(onCapture);

  // Zoom refs
  const zoomRef           = useRef(1);
  const hwZoomRangeRef    = useRef<{ min: number; max: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const zoomHideTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shot guide — stable since roomName/cleaningType never change during component lifetime
  const shotGuide    = getShotGuide(roomName, cleaningType);
  const shotGuideRef = useRef(shotGuide);

  // Guide overlay state — starts true so first shot's guide shows immediately
  const showingGuideRef = useRef(true);
  const [showingGuide, setShowingGuide] = useState(true);

  useEffect(() => { onCaptureRef.current = onCapture;  }, [onCapture]);
  useEffect(() => { maxRef.current       = maxCaptures; }, [maxCaptures]);

  const [permission,    setPermission]    = useState<'pending' | 'granted' | 'denied'>('pending');
  const [stability,     setStability]     = useState(0);
  const [flash,         setFlash]         = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [angleIdx,      setAngleIdx]      = useState(0);
  const [zoomLevel,     setZoomLevel]     = useState(1);
  const [showZoom,      setShowZoom]      = useState(false);
  const [hwZoom,        setHwZoom]        = useState(false);
  const [isDark,        setIsDark]        = useState(false);
  const darkFramesRef = useRef(0);

  // ── Escape key to close ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Request camera ────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        setPermission('granted');
      })
      .catch(() => {
        if (!cancelled) setPermission('denied');
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Assign srcObject once the video element exists ────────────────────────

  useEffect(() => {
    if (permission !== 'granted') return;
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
  }, [permission]);

  // ── Detect hardware zoom support ──────────────────────────────────────────

  useEffect(() => {
    if (permission !== 'granted') return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities() as Record<string, unknown>;
    if (caps?.zoom && typeof caps.zoom === 'object') {
      const z = caps.zoom as { min: number; max: number };
      hwZoomRangeRef.current = { min: z.min, max: z.max };
      setHwZoom(true);
    }
  }, [permission]);

  // ── Zoom helpers ──────────────────────────────────────────────────────────

  function applyZoom(level: number) {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const max     = hwZoomRangeRef.current?.max ?? 4;
    const clamped = Math.max(1, Math.min(max, level));
    zoomRef.current = clamped;
    setZoomLevel(clamped);

    if (hwZoomRangeRef.current) {
      track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] }).catch(() => {});
    }

    setShowZoom(true);
    if (zoomHideTimerRef.current) clearTimeout(zoomHideTimerRef.current);
    zoomHideTimerRef.current = setTimeout(() => setShowZoom(false), 1200);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchStartDistRef.current  = Math.hypot(dx, dy);
    pinchStartZoomRef.current  = zoomRef.current;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2 || pinchStartDistRef.current === null) return;
    const dx   = e.touches[0].clientX - e.touches[1].clientX;
    const dy   = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    applyZoom(pinchStartZoomRef.current * (dist / pinchStartDistRef.current));
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchStartDistRef.current = null;
  }

  // ── Capture a single frame ────────────────────────────────────────────────

  const captureFrame = useCallback(() => {
    if (capturingRef.current) return;
    if (countRef.current >= maxRef.current) return;

    capturingRef.current = true;
    const video = videoRef.current;
    if (!video) { capturingRef.current = false; return; }

    const cap = document.createElement('canvas');
    cap.width  = video.videoWidth  || 1280;
    cap.height = video.videoHeight || 720;
    const ctx  = cap.getContext('2d')!;

    const zoom = zoomRef.current;
    if (!hwZoomRangeRef.current && zoom > 1) {
      // Software zoom: crop the centre and scale up to full resolution
      const srcW = cap.width  / zoom;
      const srcH = cap.height / zoom;
      const srcX = (cap.width  - srcW) / 2;
      const srcY = (cap.height - srcH) / 2;
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, cap.width, cap.height);
    } else {
      ctx.drawImage(video, 0, 0);
    }

    setFlash(true);
    setTimeout(() => setFlash(false), 250);

    cap.toBlob(blob => {
      if (blob) {
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCaptureRef.current(file);
        countRef.current += 1;
        setCapturedCount(countRef.current);

        // Advance to next guided shot
        const nextAngle = angleIdxRef.current + 1;
        angleIdxRef.current = nextAngle;
        setAngleIdx(nextAngle);

        // Show guide for next shot if there are more shots and capacity remains
        if (countRef.current < maxRef.current && nextAngle < shotGuideRef.current.length) {
          showingGuideRef.current = true;
          setShowingGuide(true);
        } else {
          showingGuideRef.current = false;
          setShowingGuide(false);
        }
      }
      // Reset stability for next capture
      stableRef.current = 0;
      prevRef.current   = null;
      setStability(0);
      capturingRef.current = false;
    }, 'image/jpeg', 0.92);
  }, []);

  // ── Stability-detection rAF loop ──────────────────────────────────────────

  useEffect(() => {
    if (permission !== 'granted') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width  = PREVIEW_W;
    canvas.height = PREVIEW_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    let animId: number;

    function tick() {
      const video = videoRef.current;
      // Pause loop while guide overlay is showing
      if (!video || video.readyState < 2 || capturingRef.current || countRef.current >= maxRef.current || showingGuideRef.current) {
        animId = requestAnimationFrame(tick);
        return;
      }

      ctx.drawImage(video, 0, 0, PREVIEW_W, PREVIEW_H);
      const curr = ctx.getImageData(0, 0, PREVIEW_W, PREVIEW_H).data;
      const prev = prevRef.current;

      // Always compute brightness (even on first frame, no prev needed)
      {
        let brightnessSum = 0, n = 0;
        for (let i = 0; i < curr.length; i += SAMPLE_STRIDE) {
          brightnessSum += (curr[i] + curr[i+1] + curr[i+2]) / 3;
          n++;
        }
        const avgBrightness = brightnessSum / n;
        if (avgBrightness < BRIGHTNESS_THRESHOLD) {
          darkFramesRef.current = Math.min(DARK_FRAMES_NEEDED, darkFramesRef.current + 1);
        } else {
          darkFramesRef.current = 0;
          setIsDark(false);
        }
        if (darkFramesRef.current >= DARK_FRAMES_NEEDED) setIsDark(true);
      }

      if (prev) {
        let diffSum = 0, n = 0;
        for (let i = 0; i < curr.length; i += SAMPLE_STRIDE) {
          diffSum +=
            Math.abs(curr[i]   - prev[i])   +
            Math.abs(curr[i+1] - prev[i+1]) +
            Math.abs(curr[i+2] - prev[i+2]);
          n++;
        }
        const avg = diffSum / n;

        if (avg < DIFF_THRESHOLD) {
          stableRef.current = Math.min(STABILITY_FRAMES, stableRef.current + 1);
        } else {
          stableRef.current = Math.max(0, stableRef.current - 4);
        }

        const pct = (stableRef.current / STABILITY_FRAMES) * 100;
        setStability(pct);

        if (stableRef.current >= STABILITY_FRAMES) {
          captureFrame();
        }
      }

      prevRef.current = new Uint8ClampedArray(curr);
      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [permission, captureFrame]);

  // ── Guide handlers ────────────────────────────────────────────────────────

  function handleGotIt() {
    stableRef.current  = 0;
    prevRef.current    = null;
    setStability(0);
    showingGuideRef.current = false;
    setShowingGuide(false);
  }

  function handleSkip() {
    const next = angleIdxRef.current + 1;
    angleIdxRef.current = next;
    setAngleIdx(next);
    if (next >= shotGuideRef.current.length) {
      // All guided shots accounted for — go free-form
      showingGuideRef.current = false;
      setShowingGuide(false);
      stableRef.current = 0;
      prevRef.current   = null;
      setStability(0);
    }
    // else: re-renders with next shot's guide showing
  }

  // ── Derived UI ────────────────────────────────────────────────────────────

  const isDone       = capturedCount >= maxCaptures;
  const allAngles    = capturedCount >= shotGuide.length;
  const currentShot  = shotGuide[Math.min(angleIdx, shotGuide.length - 1)];
  const dashOffset   = RING_CIRC * (1 - stability / 100);

  const statusText =
    isDone          ? `${capturedCount} photos captured` :
    stability >= 90 ? 'Hold still…' :
    stability > 30  ? 'Almost — keep steady' :
                      currentShot.hint;

  const pillCls =
    isDone          ? 'bg-gray-700/80 text-gray-300' :
    stability >= 90 ? 'bg-green-600/80 text-white'   :
    stability > 30  ? 'bg-amber-600/70 text-white'   :
                      'bg-black/60 text-white';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none" style={{ touchAction: 'none' }}>

      {/* Capture flash */}
      {flash && <div className="absolute inset-0 bg-white z-20 pointer-events-none" />}

      {/* ── Header ── */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-2 bg-gradient-to-b from-black/70 to-transparent">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">Scanning room</p>
          <p className="text-white font-semibold text-base leading-tight">{roomName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/40 transition-colors text-base font-semibold"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      {/* ── Permission denied ── */}
      {permission === 'denied' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
          <div className="text-5xl">📷</div>
          <p className="text-white font-semibold text-lg">Camera access required</p>
          <p className="text-gray-400 text-sm leading-relaxed">
            Please allow camera access in your browser settings.
            <br />
            <span className="text-gray-500 text-xs">iPhone: Settings → Safari → Camera → Allow</span>
          </p>
          <button type="button" onClick={onClose}
            className="mt-2 px-6 py-2.5 bg-white/10 rounded-xl text-white text-sm font-medium hover:bg-white/20 transition-colors">
            Go back
          </button>
        </div>
      )}

      {/* ── Waiting for permission ── */}
      {permission === 'pending' && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm animate-pulse">Starting camera…</p>
        </div>
      )}

      {/* ── Camera active ── */}
      {permission === 'granted' && (
        <>
          {/* Video + overlays */}
          <div
            className="relative flex-1 overflow-hidden bg-black"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
              style={!hwZoom && zoomLevel > 1 ? { transform: `scale(${zoomLevel})` } : undefined}
            />

            {/* Zoom level indicator */}
            {showZoom && zoomLevel > 1.05 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="bg-black/60 text-white text-xl font-bold px-5 py-2 rounded-full">
                  {zoomLevel.toFixed(1)}×
                </div>
              </div>
            )}

            {/* Viewfinder corners */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[84%] h-[72%] relative">
                <div className="absolute top-0 left-0 h-8 w-8 border-t-[3px] border-l-[3px] border-white/60 rounded-tl-lg" />
                <div className="absolute top-0 right-0 h-8 w-8 border-t-[3px] border-r-[3px] border-white/60 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-[3px] border-l-[3px] border-white/60 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-[3px] border-r-[3px] border-white/60 rounded-br-lg" />
              </div>
            </div>

            {/* Status pill */}
            <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
              <div className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${pillCls}`}>
                {statusText}
              </div>
            </div>

            {/* Shot progress dots — top right */}
            {!isDone && (
              <div className="absolute top-3 right-4 flex gap-1 items-center">
                {shotGuide.map((_, i) => (
                  <div key={i} className={`h-2 w-2 rounded-full transition-colors ${
                    i < capturedCount   ? 'bg-green-400' :
                    i === capturedCount ? 'bg-white'     :
                                         'bg-white/30'
                  }`} />
                ))}
              </div>
            )}

            {/* ── Shot guide overlay ── */}
            {showingGuide && !isDone && (
              <div
                className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 gap-5"
                style={{ background: 'rgba(0,0,0,0.88)' }}
              >
                {/* Shot counter */}
                <p className="text-gray-400 text-xs uppercase tracking-widest">
                  Shot {Math.min(angleIdx + 1, shotGuide.length)} of {shotGuide.length}
                </p>

                {/* Icon */}
                <span className="text-7xl leading-none">{currentShot.icon}</span>

                {/* Label + hint */}
                <div className="text-center">
                  <p className="text-white font-bold text-2xl mb-2">{currentShot.label}</p>
                  <p className="text-gray-300 text-sm leading-relaxed max-w-xs">{currentShot.hint}</p>
                </div>

                {/* Minimum capture nudge — shown only on the first shot */}
                {angleIdx === 0 && (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 max-w-xs text-center">
                    <p className="text-amber-300 text-xs leading-relaxed">
                      <span className="font-semibold">Heads up:</span> for this room, at minimum we need{' '}
                      <span className="text-white font-medium">{getRoomMinHint(roomName)}</span>.
                      {' '}Everything else is a bonus for the AI.
                    </p>
                  </div>
                )}

                {/* Privacy notice */}
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 max-w-xs text-center">
                  <p className="text-gray-400 text-xs leading-relaxed">
                    🔒 Ensure <span className="text-white font-medium">no people, faces, or personal documents</span> are visible.
                    {' '}Photos may be used to improve our AI models.
                  </p>
                </div>

                {/* Actions */}
                <button
                  type="button"
                  onClick={handleGotIt}
                  className="w-full max-w-xs py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-base transition-colors"
                >
                  Got it — start capturing →
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-gray-500 hover:text-gray-300 text-sm transition-colors py-1"
                >
                  Skip this shot
                </button>
              </div>
            )}
          </div>

          {/* ── Bottom controls ── */}
          <div className="bg-black px-6 pt-4 pb-8 flex flex-col items-center gap-3">

            {/* Shot label + hint */}
            {!isDone && !showingGuide && (
              <div className="text-center">
                <p className="text-white text-sm font-semibold">
                  {currentShot.icon} {currentShot.label}
                  {' '}· Shot {Math.min(capturedCount + 1, shotGuide.length)} of {shotGuide.length}
                </p>
                <p className="text-gray-400 text-xs mt-0.5">{currentShot.hint}</p>
              </div>
            )}

            {isDone && (
              <p className="text-gray-400 text-xs text-center">
                All {capturedCount} photos captured for this room
              </p>
            )}

            {/* Dark room warning */}
            {isDark && !isDone && !showingGuide && (
              <div className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40">
                <span className="text-lg shrink-0">💡</span>
                <p className="text-amber-300 text-xs leading-snug">
                  Room looks dark — turn on the lights for better AI results
                </p>
              </div>
            )}

            {/* Capture ring button */}
            <div className="relative flex items-center justify-center">
              <svg width={88} height={88} className="absolute" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
                <circle cx={44} cy={44} r={RING_R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={5} />
                <circle
                  cx={44} cy={44} r={RING_R}
                  fill="none"
                  stroke={stability >= 90 ? '#4ade80' : '#ffffff'}
                  strokeWidth={5}
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.08s linear, stroke 0.25s' }}
                />
              </svg>
              <button
                type="button"
                onClick={captureFrame}
                disabled={isDone || showingGuide}
                aria-label="Capture photo"
                className="relative z-10 h-16 w-16 rounded-full bg-white shadow-xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
              >
                <div className="h-[52px] w-[52px] rounded-full border-[3px] border-gray-300 bg-white" />
              </button>
            </div>

            {capturedCount === 0 && !showingGuide && (
              <p className="text-gray-600 text-xs text-center">
                Ring fills as you hold steady · tap to capture manually
              </p>
            )}

            {/* Extra shots note once all guided shots done */}
            {allAngles && !isDone && !showingGuide && (
              <p className="text-gray-400 text-xs text-center leading-relaxed">
                All guided shots done! You can keep capturing more detail, or tap{' '}
                <span className="text-white font-medium">Done</span>{' '}
                {isLastRoom
                  ? 'to start the AI analysis'
                  : 'to move to the next room'}
              </p>
            )}

            {/* Done button */}
            {capturedCount > 0 && (
              <button type="button" onClick={onClose}
                className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm active:bg-brand-700 transition-colors">
                Done — {capturedCount} photo{capturedCount !== 1 ? 's' : ''} captured
              </button>
            )}
          </div>
        </>
      )}

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
