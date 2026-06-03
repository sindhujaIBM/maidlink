import { useCallback, useRef } from 'react';

export function useSpeech() {
  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const unlockedRef  = useRef(false);

  // Call this on a user gesture (button tap) to unlock iOS audio autoplay restriction.
  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    // Tiny silent WAV played on user gesture — unlocks the audio context for subsequent plays
    const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    silent.play().then(() => { unlockedRef.current = true; }).catch(() => { unlockedRef.current = true; });
  }, []);

  const playAudio = useCallback((base64: string, mimeType = 'audio/mpeg') => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const blob  = new Blob([bytes], { type: mimeType });
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.play().catch(() => {
      // Autoplay still blocked — silently ignore
    });

    audio.onended = () => URL.revokeObjectURL(url);
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  return { playAudio, stop, unlock };
}
