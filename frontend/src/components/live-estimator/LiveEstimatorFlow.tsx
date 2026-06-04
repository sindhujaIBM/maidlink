import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LiveRoomSetup } from './LiveRoomSetup';
import { VideoFeed } from './VideoFeed';
import { AgentOverlay } from './AgentOverlay';
import { RoomProgress } from './RoomProgress';
import { useWebSocket, type ServerMessage } from '../../hooks/useWebSocket';
import { useFrameCapture } from '../../hooks/useFrameCapture';
import { useSpeech } from '../../hooks/useSpeech';
import { useAuth } from '../../contexts/AuthContext';
import { buildGoogleAuthUrl } from '../../api/auth';
import type { EstimatorAnalysisResult } from '../../api/estimator';

type Phase = 'setup' | 'walkthrough' | 'results';

interface HomeDetails {
  rooms:        string[];
  cleaningType: string;
  bedrooms:     number;
  bathrooms:    number;
  sqftRange:    string;
}

interface Props {
  onBack: () => void;
}

const WS_BASE = import.meta.env.VITE_LIVE_WS_URL ?? 'ws://localhost:3105';

export function LiveEstimatorFlow({ onBack }: Props) {
  const { token, isLoading, isAuthenticated } = useAuth();

  const [phase,          setPhase]          = useState<Phase>('setup');
  const [homeDetails,    setHomeDetails]    = useState<HomeDetails | null>(null);
  const [guidanceText,   setGuidanceText]   = useState('');
  const [isStreaming,    setIsStreaming]     = useState(false);
  const [currentRoom,    setCurrentRoom]    = useState<string | null>(null);
  const [completedRooms, setCompletedRooms] = useState<string[]>([]);
  const [frameCount,     setFrameCount]     = useState(0);
  const [result,         setResult]         = useState<EstimatorAnalysisResult | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [openRooms,      setOpenRooms]      = useState<Set<string>>(new Set());
  const [paused,         setPaused]         = useState(false);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const statusRef = useRef<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle');
  const { playAudio, unlock } = useSpeech();

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'guidance_chunk':
        setIsStreaming(true);
        setGuidanceText(prev => prev + (msg.text ?? ''));
        break;
      case 'guidance_end':
        setIsStreaming(false);
        break;
      case 'audio':
        if (msg.data && msg.mimeType) playAudio(msg.data, msg.mimeType);
        break;
      case 'angle_request':
        if (msg.instruction) { setGuidanceText(msg.instruction); setIsStreaming(false); }
        break;
      case 'room_complete':
        if (msg.room) {
          setCompletedRooms(prev => [...prev, msg.room!]);
          setCurrentRoom(null);  // user picks next room
          setGuidanceText('');
        }
        break;
      case 'estimate_ready':
        setResult(msg.result as EstimatorAnalysisResult);
        setPhase('results');
        break;
      case 'error':
        setError(msg.message ?? 'Something went wrong');
        break;
    }
  }, [playAudio]);

  const { status, connect, send, disconnect } = useWebSocket({ onMessage: handleMessage });
  statusRef.current = status;

  const handleFrame = useCallback((base64: string, mediaType: string) => {
    if (statusRef.current !== 'open' || !currentRoom) return;
    send('frame', { room: currentRoom, data: base64, mediaType });
    setFrameCount(prev => prev + 1);
  }, [currentRoom, send]);

  useFrameCapture({
    videoRef,
    enabled: phase === 'walkthrough' && status === 'open' && !paused && !!currentRoom,
    onFrame: handleFrame,
  });

  const handleStart = useCallback((details: HomeDetails) => {
    setHomeDetails(details);
    setPhase('walkthrough');

    const wsUrl = `${WS_BASE}?token=${encodeURIComponent(token ?? '')}`;
    connect(wsUrl);

    const tryStart = (attempts = 0) => {
      if (statusRef.current === 'open') {
        send('start', {
          rooms:        details.rooms,
          cleaningType: details.cleaningType,
          bedrooms:     details.bedrooms,
          bathrooms:    details.bathrooms,
          sqftRange:    details.sqftRange,
        });
      } else if (attempts < 20) {
        setTimeout(() => tryStart(attempts + 1), 150);
      }
    };
    setTimeout(() => tryStart(), 300);
  }, [token, connect, send]);

  const handleSkipRoom = useCallback(() => {
    if (statusRef.current === 'open' && currentRoom) {
      send('skip_room', { room: currentRoom });
    }
  }, [send, currentRoom]);

  const handleStop = useCallback(() => {
    disconnect();
    setPhase('setup');
    setGuidanceText('');
    setCurrentRoom(null);
    setCompletedRooms([]);
    setFrameCount(0);
    setError(null);
    setPaused(false);
  }, [disconnect]);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  if (!isLoading && !isAuthenticated) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-700 font-medium mb-2">Sign in to use the Live Estimator</p>
        <p className="text-sm text-gray-500 mb-6">You need an account to start a live walkthrough.</p>
        <button
          onClick={() => {
            sessionStorage.setItem('authReturnTo', '/estimate');
            window.location.href = buildGoogleAuthUrl();
          }}
          className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error} —{' '}
          <button onClick={handleStop} className="underline">Start over</button>
        </div>
      )}

      {phase === 'setup' && <LiveRoomSetup onStart={handleStart} onUnlock={unlock} />}

      {phase === 'walkthrough' && homeDetails && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <VideoFeed ref={videoRef} onError={err => setError(`Camera error: ${err}`)} />
              {currentRoom
                ? <AgentOverlay
                    text={guidanceText}
                    isStreaming={isStreaming}
                    currentRoom={currentRoom}
                    frameCount={frameCount}
                  />
                : <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/60 text-white rounded-2xl px-6 py-4 text-center max-w-xs">
                      <p className="font-medium mb-1">Pick a room to scan</p>
                      <p className="text-sm opacity-75">Tap any room in the list to start scanning it.</p>
                    </div>
                  </div>
              }
            </div>
            <div className="flex items-center justify-between px-1 gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`w-2 h-2 rounded-full ${
                  status === 'open'       ? 'bg-green-500 animate-pulse' :
                  status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                                           'bg-gray-300'
                }`} />
                <span className="text-xs text-gray-500">
                  {status === 'open' ? 'AI connected' : status === 'connecting' ? 'Connecting…' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {currentRoom && (
                  <>
                    <button
                      onClick={() => setPaused(p => !p)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        paused
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      onClick={handleSkipRoom}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 transition-colors"
                    >
                      Skip room
                    </button>
                  </>
                )}
                <button onClick={handleStop} className="text-xs text-gray-400 hover:text-gray-600 underline">
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <RoomProgress
              rooms={homeDetails.rooms}
              currentRoom={currentRoom}
              completedRooms={completedRooms}
              onSelectRoom={room => { setCurrentRoom(room); setGuidanceText(''); setPaused(false); }}
            />
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-xs font-medium text-blue-700 mb-1">Tips</p>
              <ul className="text-xs text-blue-600 space-y-1">
                <li>• Move slowly — let each frame settle</li>
                <li>• Cover corners, floors, and countertops</li>
                <li>• The AI will ask if it needs a closer look</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {phase === 'results' && result && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Your Estimate</h2>
            <Link to="/estimate/history" className="text-sm text-teal-600 hover:underline">
              View in history
            </Link>
          </div>

          <div className="bg-teal-600 text-white rounded-2xl p-6">
            <p className="text-sm opacity-80 mb-1">Estimated cleaning time</p>
            <div className="flex items-baseline gap-4">
              <div>
                <span className="text-3xl font-bold">{result.oneCleanerHours}</span>
                <span className="text-sm ml-1 opacity-80">hrs (1 cleaner)</span>
              </div>
              <div className="text-teal-200">·</div>
              <div>
                <span className="text-2xl font-bold">{result.twoCleanerHours}</span>
                <span className="text-sm ml-1 opacity-80">hrs (2 cleaners)</span>
              </div>
            </div>
            <p className="text-sm mt-3 opacity-90">{result.conditionAssessment}</p>
          </div>

          {result.upgradeRecommendation && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-amber-800 mb-1">
                Suggested upgrade: {result.upgradeRecommendation.suggestedType}
              </p>
              <p className="text-sm text-amber-700 mb-3">{result.upgradeRecommendation.reason}</p>
              <ul className="space-y-1">
                {result.upgradeRecommendation.benefits.map(b => (
                  <li key={b} className="text-xs text-amber-600 flex gap-1.5">
                    <span>+</span><span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">Room Breakdown</p>
            </div>
            {result.roomBreakdown.map(rb => (
              <div key={rb.room} className="px-5 py-3 border-b border-gray-50 last:border-0 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">{rb.room}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{rb.notes}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {rb.priorityTasks.map(t => (
                      <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    rb.condition === 'pristine' ? 'bg-green-100 text-green-700' :
                    rb.condition === 'average'  ? 'bg-blue-100 text-blue-700' :
                    rb.condition === 'messy'    ? 'bg-amber-100 text-amber-700' :
                                                 'bg-red-100 text-red-700'
                  }`}>
                    {rb.condition.replace('_', ' ')}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{rb.estimatedMinutes} min</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">Cleaning Checklist</p>
            </div>
            {result.generatedChecklist.map(rc => (
              <div key={rc.room} className="border-b border-gray-50 last:border-0">
                <button
                  onClick={() => setOpenRooms(prev => {
                    const next = new Set(prev);
                    next.has(rc.room) ? next.delete(rc.room) : next.add(rc.room);
                    return next;
                  })}
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-800">{rc.room}</span>
                  <span className="text-gray-400 text-xs">{openRooms.has(rc.room) ? '▲' : '▼'}</span>
                </button>
                {openRooms.has(rc.room) && (
                  <div className="px-5 pb-3 space-y-1.5">
                    {rc.tasks.map(t => (
                      <div key={t.task} className="flex items-start gap-2">
                        <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                          t.priority === 'high' ? 'bg-red-400' :
                          t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-300'
                        }`} />
                        <div>
                          <p className="text-xs text-gray-700">{t.task}</p>
                          {t.aiNote && <p className="text-xs text-gray-400 italic mt-0.5">{t.aiNote}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Link
              to="/maids"
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 rounded-xl text-center text-sm transition-colors"
            >
              Book a cleaner
            </Link>
            <button
              onClick={() => { handleStop(); onBack(); }}
              className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-3 rounded-xl text-sm transition-colors"
            >
              New walkthrough
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
