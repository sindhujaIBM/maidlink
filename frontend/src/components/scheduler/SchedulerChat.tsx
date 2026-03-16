import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sendSchedulerMessage, type ChatMessage, type BookingIntent } from '../../api/scheduler';
import { listMaids, type MaidListItem } from '../../api/users';
import { MaidCard } from '../maids/MaidCard';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../contexts/AuthContext';
import { buildGoogleAuthUrl } from '../../api/auth';

const GREETING = "Hi! I can help you book a cleaning in Calgary. When do you need it, and what kind of clean are you looking for?";

function buildDetailLink(maidId: string, intent: BookingIntent) {
  const p = new URLSearchParams({
    date:         intent.date,
    time:         intent.time,
    cleaningType: intent.cleaningType,
  });
  return `/maids/${maidId}?${p.toString()}`;
}

export function SchedulerChat() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: GREETING },
  ]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [intent,   setIntent]   = useState<BookingIntent | null>(null);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Once we have intent, fetch matching maids
  const { data: maids = [], isLoading: maidsLoading } = useQuery({
    queryKey:  ['scheduler-maids', intent],
    queryFn:   () => listMaids({
      postalCode:    intent!.postalCode,
      availableDate: intent!.date,
      startTime:     intent!.time,
    }),
    enabled: !!intent,
  });

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const updated: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(updated);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await sendSchedulerMessage(updated);
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
      if (res.intent) setIntent(res.intent);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleReset() {
    setMessages([{ role: 'assistant', content: GREETING }]);
    setInput('');
    setIntent(null);
    setError(null);
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 transition-colors flex items-center justify-center"
        aria-label="Open scheduling assistant"
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[22rem] sm:w-[26rem] flex flex-col rounded-2xl shadow-2xl border border-gray-200 bg-white overflow-hidden"
             style={{ maxHeight: '80vh' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-brand-600 text-white">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <div>
                <p className="font-semibold text-sm">Booking Assistant</p>
                <p className="text-xs text-brand-200">Powered by AI</p>
              </div>
            </div>
            <button onClick={handleReset} className="text-xs text-brand-200 hover:text-white transition-colors">
              New chat
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50" style={{ minHeight: '200px', maxHeight: '380px' }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
                  <div className="flex gap-1 items-center h-5">
                    <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500 text-center">{error}</p>
            )}

            {/* Maid results once intent is captured */}
            {intent && (
              <div className="pt-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Available maids
                </p>
                {maidsLoading && <div className="flex justify-center py-4"><Spinner size="sm" /></div>}
                {!maidsLoading && maids.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-3">
                    No maids available for those filters. Try adjusting your time or date.
                  </p>
                )}
                <div className="space-y-2">
                  {maids.slice(0, 3).map((maid: MaidListItem) => (
                    <MaidCard
                      key={maid.id}
                      maid={maid}
                      detailLink={buildDetailLink(maid.id, intent!)}
                    />
                  ))}
                </div>
                {maids.length > 3 && (
                  <button
                    onClick={() => {
                      const p = new URLSearchParams({
                        date:         intent.date,
                        time:         intent.time,
                        cleaningType: intent.cleaningType,
                        postalCode:   intent.postalCode,
                      });
                      navigate(`/maids?${p.toString()}`);
                      setOpen(false);
                    }}
                    className="mt-2 w-full text-xs text-brand-600 hover:underline"
                  >
                    View all {maids.length} maids →
                  </button>
                )}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 bg-white px-3 py-3">
            {!isAuthenticated ? (
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-2">Sign in to use the booking assistant</p>
                <button
                  onClick={() => { sessionStorage.setItem('authReturnTo', window.location.pathname); window.location.href = buildGoogleAuthUrl(); }}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 shadow-sm text-gray-700 font-medium text-xs transition-colors"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message…"
                  disabled={loading}
                  className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="h-9 w-9 rounded-xl bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
