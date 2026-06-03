import { useCallback, useRef } from 'react';

export function useSpeech() {
  // A single persistent audio element, blessed once on user gesture and reused forever.
  // iOS Safari only allows programmatic play() on an element that has been played
  // (even silently) during a direct user interaction.
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const blessedRef  = useRef(false);

  const getAudio = (): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  };

  // Call this on a user gesture (e.g. the Start button tap) to bless the audio element.
  const unlock = useCallback(() => {
    if (blessedRef.current) return;
    const audio = getAudio();
    // Play a silent data URI — this is the gesture-gated call that makes iOS happy
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    audio.play()
      .then(() => { audio.pause(); blessedRef.current = true; })
      .catch(() =>  { blessedRef.current = true; }); // already allowed, or will be
  }, []);

  const playAudio = useCallback((base64: string, mimeType = 'audio/mpeg') => {
    const audio = getAudio();

    // Stop whatever is playing
    if (!audio.paused) audio.pause();

    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const blob    = new Blob([bytes], { type: mimeType });
    const prevSrc = audio.src;
    const url     = URL.createObjectURL(blob);

    audio.src = url;
    audio.play().catch(() => {});

    // Revoke the previous blob URL once the new one has loaded
    if (prevSrc.startsWith('blob:')) URL.revokeObjectURL(prevSrc);
    audio.onended = () => URL.revokeObjectURL(url);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      audio.src = '';
    }
  }, []);

  return { playAudio, stop, unlock };
}
