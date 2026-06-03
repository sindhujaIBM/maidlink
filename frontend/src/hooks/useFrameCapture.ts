import { useCallback, useEffect, useRef, useState } from 'react';

interface UseFrameCaptureOptions {
  videoRef:          React.RefObject<HTMLVideoElement>;
  enabled:           boolean;
  intervalMs?:       number;   // how often to sample (default 1000ms)
  minSendIntervalMs?: number;  // min time between sends (default 3000ms)
  onFrame:           (base64: string, mediaType: string) => void;
}

const BLUR_THRESHOLD        = 80;   // Laplacian variance below this = blurry
const SCENE_CHANGE_THRESHOLD = 12;  // mean pixel diff above this = new scene
const DOWNSAMPLE_W          = 160;
const DOWNSAMPLE_H          = 90;
// API Gateway WebSocket has a 128KB message limit — cap send frames to stay well under it
const SEND_MAX_W            = 640;
const SEND_MAX_H            = 360;

function computeBlurScore(imageData: ImageData): number {
  // Laplacian variance on grayscale: higher = sharper
  const { data, width, height } = imageData;
  let sum = 0, sumSq = 0, count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const top    = idx - width * 4;
      const bottom = idx + width * 4;
      const gT = 0.299 * data[top]    + 0.587 * data[top + 1]    + 0.114 * data[top + 2];
      const gB = 0.299 * data[bottom] + 0.587 * data[bottom + 1] + 0.114 * data[bottom + 2];
      const gL = 0.299 * data[idx-4]  + 0.587 * data[idx - 3]    + 0.114 * data[idx - 2];
      const gR = 0.299 * data[idx+4]  + 0.587 * data[idx + 5]    + 0.114 * data[idx + 6];
      const lap = Math.abs(4 * gray - gT - gB - gL - gR);
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  return (sumSq / count) - mean * mean; // variance
}

function computeMeanDiff(a: ImageData, b: ImageData): number {
  let total = 0;
  const len = a.data.length;
  for (let i = 0; i < len; i += 16) { // sample every 4th pixel
    total += Math.abs(a.data[i] - b.data[i]);
  }
  return total / (len / 16);
}

export function useFrameCapture({
  videoRef,
  enabled,
  intervalMs       = 1000,
  minSendIntervalMs = 3000,
  onFrame,
}: UseFrameCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const lastFrameDataRef  = useRef<ImageData | null>(null);
  const lastSentAtRef     = useRef<number>(0);
  const onFrameRef        = useRef(onFrame);
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const sampleCanvasRef   = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef  = useRef<HTMLCanvasElement | null>(null);

  onFrameRef.current = onFrame;

  const getSampleCanvas = () => {
    if (!sampleCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width  = DOWNSAMPLE_W;
      c.height = DOWNSAMPLE_H;
      sampleCanvasRef.current = c;
    }
    return sampleCanvasRef.current;
  };

  const start = useCallback(() => {
    if (intervalRef.current) return;
    setIsCapturing(true);

    intervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      // Downsample for analysis
      const sc   = getSampleCanvas();
      const sCtx = sc.getContext('2d')!;
      sCtx.drawImage(video, 0, 0, DOWNSAMPLE_W, DOWNSAMPLE_H);
      const currentData = sCtx.getImageData(0, 0, DOWNSAMPLE_W, DOWNSAMPLE_H);

      // Blur check
      const blurScore = computeBlurScore(currentData);
      if (blurScore < BLUR_THRESHOLD) return;

      // Scene change check
      const now = Date.now();
      if (lastFrameDataRef.current) {
        const diff = computeMeanDiff(currentData, lastFrameDataRef.current);
        if (diff < SCENE_CHANGE_THRESHOLD) return;
      }

      // Throttle sends
      if (now - lastSentAtRef.current < minSendIntervalMs) return;

      // Capture at capped resolution to stay under API GW's 128KB WebSocket message limit
      if (!captureCanvasRef.current) {
        captureCanvasRef.current = document.createElement('canvas');
      }
      const cc = captureCanvasRef.current;
      const scale = Math.min(1, SEND_MAX_W / video.videoWidth, SEND_MAX_H / video.videoHeight);
      cc.width   = Math.round(video.videoWidth  * scale);
      cc.height  = Math.round(video.videoHeight * scale);
      const cCtx = cc.getContext('2d')!;
      cCtx.drawImage(video, 0, 0, cc.width, cc.height);

      cc.toBlob((blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = (reader.result as string).split(',')[1];
          onFrameRef.current(b64, 'image/jpeg');
          lastFrameDataRef.current = currentData;
          lastSentAtRef.current    = Date.now();
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.7);
    }, intervalMs);
  }, [videoRef, intervalMs, minSendIntervalMs]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsCapturing(false);
    lastFrameDataRef.current = null;
  }, []);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [enabled, start, stop]);

  return { isCapturing, stop };
}
