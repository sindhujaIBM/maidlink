import { useCallback, useRef } from 'react';

interface QueueItem { base64: string; mimeType: string; url?: string; }

export function useSpeech() {
  // Single persistent element blessed once on user gesture — iOS Safari requires this.
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const blessedRef = useRef(false);
  const queueRef   = useRef<QueueItem[]>([]);
  const playingRef = useRef(false);

  const getAudio = (): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  };

  const playNext = useCallback(() => {
    const item = queueRef.current.shift();
    if (!item) { playingRef.current = false; return; }

    playingRef.current = true;
    const audio = getAudio();

    const binary = atob(item.base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: item.mimeType });

    const prevSrc = audio.src;
    const url = URL.createObjectURL(blob);
    audio.src = url;
    audio.play().catch(() => {});

    if (prevSrc.startsWith('blob:')) URL.revokeObjectURL(prevSrc);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      playNext();
    };
  }, []);

  const unlock = useCallback(() => {
    if (blessedRef.current) return;
    const audio = getAudio();
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    audio.play()
      .then(() => { audio.pause(); blessedRef.current = true; })
      .catch(() => { blessedRef.current = true; });
  }, []);

  const playAudio = useCallback((base64: string, mimeType = 'audio/mpeg') => {
    queueRef.current.push({ base64, mimeType });
    if (!playingRef.current) playNext();
  }, [playNext]);

  const stop = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      audio.src = '';
    }
  }, []);

  return { playAudio, stop, unlock };
}
