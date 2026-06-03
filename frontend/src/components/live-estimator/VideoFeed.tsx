import { useCallback, useEffect, useRef, useState, forwardRef } from 'react';

interface Props {
  onStream?: (stream: MediaStream) => void;
  onError?:  (err: string) => void;
}

export const VideoFeed = forwardRef<HTMLVideoElement, Props>(({ onStream, onError }, ref) => {
  const [permissionState, setPermissionState] = useState<'requesting' | 'granted' | 'denied'>('requesting');
  const [isFullscreen,    setIsFullscreen]    = useState(false);
  const streamRef     = useRef<MediaStream | null>(null);
  const containerRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      setPermissionState('granted');
      onStream?.(stream);
    }).catch(err => {
      if (cancelled) return;
      setPermissionState('denied');
      onError?.((err as Error).message);
    });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Attach stream after the <video> element renders — ref.current is null during 'requesting'
  useEffect(() => {
    if (permissionState !== 'granted') return;
    const video = (ref as React.RefObject<HTMLVideoElement>)?.current;
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, [permissionState]);

  // Track fullscreen state changes
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current as HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    } | null;
    if (!el) return;

    if (!document.fullscreenElement) {
      (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  if (permissionState === 'denied') {
    return (
      <div className="w-full aspect-video bg-gray-900 rounded-2xl flex flex-col items-center justify-center text-white gap-3 p-6">
        <div className="text-4xl">📷</div>
        <p className="font-medium">Camera access required</p>
        <p className="text-sm text-gray-400 text-center max-w-xs">
          Please allow camera access in your browser settings and reload the page.
        </p>
      </div>
    );
  }

  if (permissionState === 'requesting') {
    return (
      <div className="w-full aspect-video bg-gray-900 rounded-2xl flex items-center justify-center">
        <div className="text-center text-white space-y-2">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm">Requesting camera access…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-2xl overflow-hidden"
      style={{ aspectRatio: isFullscreen ? undefined : '16/9' }}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      {/* Fullscreen toggle */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-lg p-1.5 transition-colors"
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen
          ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0l5 0M4 4l0 5M15 9l5-5m0 0l-5 0m5 0l0 5M9 15l-5 5m0 0l5 0m-5 0l0-5M15 15l5 5m0 0l-5 0m5 0l0-5" /></svg>
          : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
        }
      </button>
    </div>
  );
});

VideoFeed.displayName = 'VideoFeed';
