import { useEffect } from 'react';

interface ToastProps {
  message: string;
  variant?: 'success' | 'error';
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ message, variant = 'success', onDismiss, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [onDismiss, duration]);

  const colours = variant === 'success'
    ? 'bg-green-700 text-white'
    : 'bg-red-600 text-white';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${colours}`}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-1 rounded-full p-0.5 opacity-75 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-white"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
