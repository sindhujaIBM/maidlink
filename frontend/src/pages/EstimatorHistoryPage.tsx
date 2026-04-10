import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Spinner } from '../components/ui/Spinner';
import { getEstimatorHistory, type EstimatorHistoryItem } from '../api/estimator';

const CONDITION_LABEL: Record<string, string> = {
  pristine:  'Pristine',
  average:   'Average',
  messy:     'Messy',
  very_messy: 'Very Messy',
};

const CONDITION_COLOR: Record<string, string> = {
  pristine:   'text-green-700  bg-green-50  border-green-200',
  average:    'text-blue-700   bg-blue-50   border-blue-200',
  messy:      'text-amber-700  bg-amber-50  border-amber-200',
  very_messy: 'text-red-700    bg-red-50    border-red-200',
};

const PRIORITY_CLS: Record<string, string> = {
  high:     'bg-red-100    text-red-700',
  medium:   'bg-amber-100  text-amber-700',
  standard: 'bg-gray-100   text-gray-500',
};

function EstimateCard({ item }: { item: EstimatorHistoryItem }) {
  const [open, setOpen]           = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [openRooms, setOpenRooms] = useState<Set<string>>(new Set());

  const toggleRoom = (room: string) =>
    setOpenRooms(prev => { const s = new Set(prev); s.has(room) ? s.delete(room) : s.add(room); return s; });

  const hd = item.homeDetails;
  const r  = item.result;
  const date = new Date(item.createdAt).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="card overflow-hidden print:shadow-none print:border print:border-gray-300">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">
              {hd.bedrooms}bd / {hd.bathrooms}ba · {hd.sqftRange} sqft
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CONDITION_COLOR[r.overallCondition] ?? 'text-gray-600 bg-gray-50 border-gray-200'}`}>
              {CONDITION_LABEL[r.overallCondition] ?? r.overallCondition}
            </span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {hd.cleaningType ?? 'Standard'}
            </span>
            {item.adminFeedback && (
              <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                Reviewed by specialist ✓
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">{date}</p>
          <p className="text-sm text-brand-700 font-medium mt-1">
            {item.adminFeedback?.adjustedHours != null
              ? <>{item.adminFeedback.adjustedHours}h <span className="text-gray-400 font-normal text-xs">(specialist adjusted · AI: {r.oneCleanerHours}h)</span></>
              : <>{r.oneCleanerHours}h (1 cleaner) · {r.twoCleanerHours}h (2 cleaners)</>
            }
          </p>
        </div>
        <span className="text-gray-400 text-sm flex-none mt-1">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5 border-t border-gray-100 pt-4">

          {/* Specialist review callout */}
          {item.adminFeedback && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-green-800">Reviewed by a MaidLink specialist</p>
              {item.adminFeedback.adjustedHours != null && item.adminFeedback.adjustedHours !== r.oneCleanerHours && (
                <p className="text-sm text-green-800">
                  Estimate adjusted to <strong>{item.adminFeedback.adjustedHours}h</strong>{' '}
                  <span className="text-green-600 text-xs">(AI estimated {r.oneCleanerHours}h)</span>
                </p>
              )}
              <p className="text-sm text-green-700 italic">"{item.adminFeedback.note}"</p>
            </div>
          )}

          {/* AI condition summary */}
          <p className="text-sm text-gray-700 italic">{r.conditionAssessment}</p>

          {r.upgradeRecommendation && (
            <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
              Upgrade recommended: {r.upgradeRecommendation.suggestedType} — {r.upgradeRecommendation.reason}
            </div>
          )}

          {/* Photos */}
          {item.photoUrls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos</p>
              <div className="flex flex-wrap gap-2">
                {item.photoUrls.map((url, i) => (
                  <button key={i} type="button" onClick={() => setActivePhoto(url)}
                    className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-brand-400 transition">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Room breakdown */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Room Breakdown</p>
            <div className="space-y-1">
              {r.roomBreakdown.map(rb => (
                <div key={rb.room} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-800 font-medium">{rb.room}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CONDITION_COLOR[rb.condition] ?? 'text-gray-600 bg-gray-50 border-gray-200'}`}>
                      {CONDITION_LABEL[rb.condition] ?? rb.condition}
                    </span>
                    <span className="text-gray-500">{rb.estimatedMinutes} min</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cleaning Checklist</p>
            <div className="space-y-2">
              {r.generatedChecklist.map(rc => {
                const highCount = rc.tasks.filter(t => t.priority === 'high').length;
                return (
                  <div key={rc.room} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button type="button" onClick={() => toggleRoom(rc.room)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-800">{rc.room}</span>
                        <span className="text-xs text-gray-400">{rc.tasks.length} tasks</span>
                        {highCount > 0 && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                            {highCount} high priority
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400 text-xs">{openRooms.has(rc.room) ? '▲' : '▼'}</span>
                    </button>
                    {openRooms.has(rc.room) && (
                      <div className="px-4 py-2 divide-y divide-gray-50">
                        {rc.tasks.map((task, i) => (
                          <div key={i} className="flex items-start gap-2 py-2">
                            <span className={`text-xs font-mono flex-none mt-0.5 px-1.5 py-0.5 rounded font-bold ${PRIORITY_CLS[task.priority]}`}>
                              {task.priority === 'high' ? '!!!' : task.priority === 'medium' ? ' ! ' : '   '}
                            </span>
                            <div className="flex-1">
                              <span className="text-sm text-gray-800">{task.task}</span>
                              {task.aiNote && (
                                <p className="text-xs text-brand-600 mt-0.5 italic">{task.aiNote}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {r.confidenceNote && (
            <p className="text-xs text-gray-400 italic">{r.confidenceNote}</p>
          )}

          <div className="flex gap-3 pt-1 print:hidden">
            <button type="button" onClick={() => window.print()}
              className="btn-secondary text-sm">
              Save as PDF
            </button>
            <Link to="/maids" className="btn-primary text-sm">
              Book a cleaner
            </Link>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {activePhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 print:hidden"
          onClick={() => setActivePhoto(null)}>
          <img src={activePhoto} alt="Estimate photo" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

export function EstimatorHistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['estimatorHistory'],
    queryFn:  getEstimatorHistory,
  });

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Past Estimates</h1>
            <p className="text-gray-500 text-sm mt-1">Your last 20 AI cleaning estimates</p>
          </div>
          <Link to="/estimate" className="btn-primary text-sm">New estimate</Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !data?.length ? (
          <div className="card text-center py-12">
            <p className="text-4xl mb-3">✨</p>
            <p className="text-gray-600 font-medium">No estimates yet</p>
            <p className="text-gray-400 text-sm mt-1 mb-4">Run your first AI estimate to see it here</p>
            <Link to="/estimate" className="btn-primary text-sm">Get an estimate</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {data.map(item => <EstimateCard key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </Layout>
  );
}
