import { useCallback, useRef } from 'react';

export function useSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = useCallback((base64: string, mimeType = 'audio/mpeg') => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.play().catch(() => {
      // Autoplay blocked — fall back to SpeechSynthesis
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

  return { playAudio, stop };
}
