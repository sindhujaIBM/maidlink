import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const STABILITY_FRAMES = 50;   // ~1.7 s at ~30 fps before auto-capture fires
const DIFF_THRESHOLD   = 8;    // avg RGB diff per sampled pixel — below = "stable"
const SAMPLE_STRIDE    = 16;   // bytes between samples (every 4th pixel in RGBA data)
const PREVIEW_W        = 160;  // small canvas for diff computation
const PREVIEW_H        = 90;

const RING_R    = 36;
const RING_CIRC = 2 * Math.PI * RING_R;

// Guided angle prompts — walks the user through a 4-angle room scan
const GUIDED_ANGLES = [
  { label: 'Main view',   hint: 'Stand in the doorway — show the full room ahead' },
  { label: 'Far wall',    hint: 'Move across — capture the opposite wall & floor' },
  { label: 'Left side',   hint: 'Turn left — show the left wall, windows & corners' },
  { label: 'Right side',  hint: 'Turn right — show the right wall, floor & ceiling' },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  roomName:    string;
  maxCaptures: number;
  onCapture:   (file: File) => void;
  onClose:     () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CameraCapture({ roomName, maxCaptures, onCapture, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);  // holds stream until video element is ready

  // rAF-loop refs — avoid stale closures
  const stableRef    = useRef(0);
  const prevRef      = useRef<Uint8ClampedArray | null>(null);
  const capturingRef = useRef(false);
  const countRef     = useRef(0);
  const angleIdxRef  = useRef(0);
  const maxRef       = useRef(maxCaptures);
  const onCaptureRef = useRef(onCapture);

  useEffect(() => { onCaptureRef.current = onCapture;  }, [onCapture]);
  useEffect(() => { maxRef.current       = maxCaptures; }, [maxCaptures]);

  const [permission,    setPermission]    = useState<'pending' | 'granted' | 'denied'>('pending');
  const [stability,     setStability]     = useState(0);
  const [flash,         setFlash]         = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [angleIdx,      setAngleIdx]      = useState(0);   // which guided angle we're on

  // ── Request camera, store stream in ref ──────────────────────────────────
  // FIX: video element doesn't exist until permission === 'granted' renders it.
  // Store the stream in a ref and assign srcObject in a separate effect below.

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
        setPermission('granted');   // triggers re-render → video element mounts → effect below fires
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
    cap.getContext('2d')!.drawImage(video, 0, 0);

    setFlash(true);
    setTimeout(() => setFlash(false), 250);

    cap.toBlob(blob => {
      if (blob) {
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCaptureRef.current(file);
        countRef.current += 1;
        setCapturedCount(countRef.current);

        // Advance to next guided angle (stays at last angle once all covered)
        const nextAngle = Math.min(angleIdxRef.current + 1, GUIDED_ANGLES.length - 1);
        angleIdxRef.current = nextAngle;
        setAngleIdx(nextAngle);
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
      if (!video || video.readyState < 2 || capturingRef.current || countRef.current >= maxRef.current) {
        animId = requestAnimationFrame(tick);
        return;
      }

      ctx.drawImage(video, 0, 0, PREVIEW_W, PREVIEW_H);
      const curr = ctx.getImageData(0, 0, PREVIEW_W, PREVIEW_H).data;
      const prev = prevRef.current;

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

  // ── Derived UI ────────────────────────────────────────────────────────────

  const isDone        = capturedCount >= maxCaptures;
  const allAngles     = capturedCount >= GUIDED_ANGLES.length;
  const currentAngle  = GUIDED_ANGLES[angleIdx];
  const dashOffset    = RING_CIRC * (1 - stability / 100);

  // Status pill inside viewfinder
  const statusText =
    isDone          ? `${capturedCount} photos captured` :
    stability >= 90 ? 'Hold still…' :
    stability > 30  ? 'Almost — keep steady' :
                      currentAngle.hint;

  // Pill colour
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
          className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
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
          <div className="relative flex-1 overflow-hidden bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />

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

            {/* Angle progress dots — top right */}
            {!isDone && (
              <div className="absolute top-3 right-4 flex gap-1 items-center">
                {GUIDED_ANGLES.map((_, i) => (
                  <div key={i} className={`h-2 w-2 rounded-full transition-colors ${
                    i < capturedCount   ? 'bg-green-400' :
                    i === capturedCount ? 'bg-white'     :
                                         'bg-white/30'
                  }`} />
                ))}
              </div>
            )}
          </div>

          {/* ── Bottom controls ── */}
          <div className="bg-black px-6 pt-4 pb-8 flex flex-col items-center gap-3">

            {/* Angle label + hint */}
            {!isDone && (
              <div className="text-center">
                <p className="text-white text-sm font-semibold">
                  Angle {Math.min(capturedCount + 1, GUIDED_ANGLES.length)} of {GUIDED_ANGLES.length}
                  {' '}· {currentAngle.label}
                </p>
                <p className="text-gray-400 text-xs mt-0.5">{currentAngle.hint}</p>
              </div>
            )}

            {isDone && (
              <p className="text-gray-400 text-xs text-center">
                All {capturedCount} angles captured for this room
              </p>
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
                disabled={isDone}
                aria-label="Capture photo"
                className="relative z-10 h-16 w-16 rounded-full bg-white shadow-xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
              >
                <div className="h-[52px] w-[52px] rounded-full border-[3px] border-gray-300 bg-white" />
              </button>
            </div>

            {capturedCount === 0 && (
              <p className="text-gray-600 text-xs text-center">
                Ring fills as you hold steady · tap to capture manually
              </p>
            )}

            {/* Extra angles note once guided set done */}
            {allAngles && !isDone && (
              <p className="text-gray-500 text-xs text-center">
                All 4 angles captured — keep going for more detail or tap Done
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
