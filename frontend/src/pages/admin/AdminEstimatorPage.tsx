import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../../components/layout/Layout';
import { Spinner } from '../../components/ui/Spinner';
import { listAdminEstimatorAnalyses, type AdminEstimatorAnalysis } from '../../api/admin';

const CONDITION_LABEL: Record<string, string> = {
  pristine:   'Pristine',
  average:    'Average',
  messy:      'Messy',
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

function AnalysisCard({ item }: { item: AdminEstimatorAnalysis }) {
  const [open, setOpen]               = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [openRooms, setOpenRooms]     = useState<Set<string>>(new Set());

  const toggleRoom = (room: string) =>
    setOpenRooms(prev => { const s = new Set(prev); s.has(room) ? s.delete(room) : s.add(room); return s; });

  const hd   = item.homeDetails;
  const r    = item.result;
  const date = new Date(item.createdAt).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="card overflow-hidden print:shadow-none print:border print:border-gray-300">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          {/* User identity */}
          <div className="flex items-center gap-2 mb-1">
            {item.user.avatarUrl && (
              <img src={item.user.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
            )}
            <span className="font-semibold text-gray-900 text-sm">{item.user.name}</span>
            <span className="text-gray-400 text-xs">{item.user.email}</span>
          </div>
          {/* Estimate summary */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-700">
              {hd.bedrooms}bd / {hd.bathrooms}ba · {hd.sqftRange} sqft
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CONDITION_COLOR[r.overallCondition] ?? 'text-gray-600 bg-gray-50 border-gray-200'}`}>
              {CONDITION_LABEL[r.overallCondition] ?? r.overallCondition}
            </span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {hd.cleaningType ?? 'Standard'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{date}</p>
          <p className="text-sm text-brand-700 font-medium mt-0.5">
            {r.oneCleanerHours}h solo · {r.twoCleanerHours}h with 2
          </p>
        </div>
        <span className="text-gray-400 text-sm flex-none mt-1">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5 border-t border-gray-100 pt-4">

          <p className="text-sm text-gray-700 italic">{r.conditionAssessment}</p>

          {r.cleaningTypeNote && (
            <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
              {r.cleaningTypeNote}
            </div>
          )}

          {/* Photos */}
          {item.photoUrls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Photos ({item.photoUrls.length})
              </p>
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
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-800 font-medium">{rb.room}</span>
                    <p className="text-xs text-gray-400 truncate">{rb.notes}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-3 flex-none">
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

          <button type="button" onClick={() => window.print()}
            className="btn-secondary text-sm print:hidden">
            Save as PDF
          </button>
        </div>
      )}

      {activePhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 print:hidden"
          onClick={() => setActivePhoto(null)}>
          <img src={activePhoto} alt="Estimate photo" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

export function AdminEstimatorPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['adminEstimatorAnalyses', page],
    queryFn:  () => listAdminEstimatorAnalyses({ page, limit: 20 }),
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Estimator Usage</h1>
          <p className="text-gray-500 text-sm mt-1">
            All customer AI estimates · {data?.total ?? '—'} total
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !data?.items.length ? (
          <div className="card text-center py-12">
            <p className="text-4xl mb-3">✨</p>
            <p className="text-gray-600">No estimates yet</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {data.items.map(item => <AnalysisCard key={item.id} item={item} />)}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary text-sm disabled:opacity-40">
                  ← Prev
                </button>
                <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary text-sm disabled:opacity-40">
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
