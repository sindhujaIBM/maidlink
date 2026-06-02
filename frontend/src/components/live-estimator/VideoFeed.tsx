import { useEffect, useRef, useState, forwardRef } from 'react';

interface Props {
  onStream?: (stream: MediaStream) => void;
  onError?:  (err: string) => void;
}

export const VideoFeed = forwardRef<HTMLVideoElement, Props>(({ onStream, onError }, ref) => {
  const [permissionState, setPermissionState] = useState<'requesting' | 'granted' | 'denied'>('requesting');
  const streamRef = useRef<MediaStream | null>(null);

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

  // Attach stream after the <video> element renders — ref.current is null
  // during the 'requesting' phase because the element isn't in the DOM yet.
  useEffect(() => {
    if (permissionState !== 'granted') return;
    const video = (ref as React.RefObject<HTMLVideoElement>)?.current;
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, [permissionState]);

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
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
    </div>
  );
});

VideoFeed.displayName = 'VideoFeed';
