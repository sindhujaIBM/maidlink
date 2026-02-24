import { useEffect } from 'react';

interface ToastProps {
  message: string;
  variant?: 'success' | 'error';
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ message, variant = 'success', onDismiss, duration = 2500 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [onDismiss, duration]);

  const colours = variant === 'success'
    ? 'bg-green-600 text-white'
    : 'bg-red-600 text-white';

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${colours}`}>
      {message}
    </div>
  );
}
