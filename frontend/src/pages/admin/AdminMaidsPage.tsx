import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAdminMaids, approveMaid, rejectMaid, verifyMaid, unverifyMaid, getAdminIdDocUrl,
  listMaidApplications, approveMaidApplication, rejectMaidApplication, getApplicationIdDocUrl,
  type AdminMaid, type MaidApplication,
} from '../../api/admin';
import { Layout } from '../../components/layout/Layout';
import { Badge, statusVariant } from '../../components/ui/Badge';
import { VerifiedBadge } from '../../components/ui/VerifiedBadge';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';

const WORK_ELIGIBILITY_LABELS: Record<string, string> = {
  citizen_pr:     'Citizen / PR',
  work_permit:    'Work Permit',
  student_permit: 'Student Permit',
  no:             'Not eligible',
};

export function AdminMaidsPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<'profiles' | 'applications'>('applications');

  // Maid profiles state
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [rejectTarget, setRejectTarget] = useState<AdminMaid | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Applications state
  const [appStatusFilter, setAppStatusFilter] = useState('new');
  const [rejectAppTarget, setRejectAppTarget] = useState<MaidApplication | null>(null);
  const [rejectAppNotes, setRejectAppNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['adminMaids', statusFilter],
    queryFn:  () => listAdminMaids({ status: statusFilter }),
  });

  const { data: applications, isLoading: appsLoading } = useQuery({
    queryKey: ['maidApplications', appStatusFilter],
    queryFn:  () => listMaidApplications({ status: appStatusFilter }),
  });

  const approveAppMutation = useMutation({
    mutationFn: (id: string) => approveMaidApplication(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['maidApplications'] }),
  });

  const rejectAppMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => rejectMaidApplication(id, notes),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['maidApplications'] }); setRejectAppTarget(null); setRejectAppNotes(''); },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveMaid(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['adminMaids'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectMaid(id, reason),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['adminMaids'] }); setRejectTarget(null); setRejectReason(''); },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => verifyMaid(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['adminMaids'] }),
  });

  const unverifyMutation = useMutation({
    mutationFn: (id: string) => unverifyMaid(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['adminMaids'] }),
  });

  async function handleViewIdDoc(maidId: string) {
    try {
      const { url } = await getAdminIdDocUrl(maidId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      alert('Could not load ID document. The maid may not have uploaded one yet.');
    }
  }

  async function handleViewAppIdDoc(appId: string) {
    try {
      const { url } = await getApplicationIdDocUrl(appId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      alert('Could not load ID document.');
    }
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Maids</h1>

        {/* View toggle */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setView('applications')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'applications' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Applications {applications && applications.filter(a => a.status === 'new').length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {applications.filter(a => a.status === 'new').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setView('profiles')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'profiles' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Maid Profiles
          </button>
        </div>

        {/* ── Applications view ───────────────────────── */}
        {view === 'applications' && (
          <>
            <div className="flex gap-2 mb-4">
              {['new', 'approved', 'rejected', 'all'].map(s => (
                <button key={s} onClick={() => setAppStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${appStatusFilter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {s}
                </button>
              ))}
            </div>

            {appsLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

            <div className="space-y-4">
              {applications?.map(app => (
                <div key={app.id} className="card">
                  <div className="flex items-start justify-between gap-4">
                    {/* Photo thumbnail */}
                    <div className="h-14 w-14 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                      {app.photoUrl
                        ? <img src={app.photoUrl} alt={app.fullName} className="h-full w-full object-cover" />
                        : <span className="text-gray-400 text-2xl">👤</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-gray-900">{app.fullName}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          app.status === 'new'      ? 'bg-amber-100 text-amber-800' :
                          app.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                      'bg-red-100 text-red-800'
                        }`}>{app.status}</span>
                        <span className="text-xs text-gray-400 ml-auto">{new Date(app.createdAt).toLocaleDateString('en-CA')}</span>
                      </div>
                      <div className="text-sm text-gray-500 space-y-1">
                        <p>{app.email} · {app.phone}</p>
                        <p>{app.gender} · Age {app.age} · {WORK_ELIGIBILITY_LABELS[app.workEligibility] ?? app.workEligibility}</p>
                        <p>{app.yearsExperience} yrs exp · <span className="capitalize">{app.availability.replace('_', ' ')}</span>{app.hourlyRatePref ? ` · $${parseFloat(app.hourlyRatePref).toFixed(0)}/hr pref` : ''}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {app.hasOwnSupplies && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">Has supplies</span>}
                          {app.canDrive       && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">Can drive</span>}
                          {app.offersCooking  && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">Offers cooking</span>}
                          {app.languages.map(l => <span key={l} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{l}</span>)}
                        </div>
                        <div className="flex gap-2 mt-1 items-center">
                          {app.hasIdDoc
                            ? <button onClick={() => handleViewAppIdDoc(app.id)} className="text-xs text-brand-600 hover:underline">View ID Document</button>
                            : <span className="text-xs text-gray-400">No ID doc</span>
                          }
                          {app.referralSource && <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded">Via: {app.referralSource}</span>}
                        </div>
                        {app.bio && (
                          <div className="mt-1 max-h-20 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-500 leading-relaxed">
                            {app.bio}
                          </div>
                        )}
                        {app.notes && (
                          <div className="mt-1 max-h-16 overflow-y-auto rounded border border-red-100 bg-red-50 p-2 text-xs text-red-600 leading-relaxed">
                            <span className="font-medium">Notes:</span> {app.notes}
                          </div>
                        )}
                      </div>
                    </div>
                    {app.status === 'new' && (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button onClick={() => approveAppMutation.mutate(app.id)} disabled={approveAppMutation.isPending}
                          className="btn-primary text-sm px-3 py-1.5">Approve</button>
                        <button onClick={() => setRejectAppTarget(app)}
                          className="btn-danger text-sm px-3 py-1.5">Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!appsLoading && applications?.length === 0 && (
                <p className="text-center py-12 text-gray-500">No {appStatusFilter} applications.</p>
              )}
            </div>
          </>
        )}

        {/* ── Maid profiles view ──────────────────────── */}
        {view === 'profiles' && (
          <>
        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

        <div className="space-y-4">
          {data?.maids.map(maid => (
            <div key={maid.id} className="card">
              <div className="flex items-start justify-between gap-4">
                {/* Profile photo */}
                <div className="h-14 w-14 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                  {maid.photoUrl
                    ? <img src={maid.photoUrl} alt={maid.user.fullName} className="h-full w-full object-cover" />
                    : <span className="text-gray-400 text-2xl">👤</span>
                  }
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-gray-900">{maid.user.fullName}</span>
                    <Badge variant={statusVariant(maid.status)}>{maid.status}</Badge>
                    {maid.isVerified && <VerifiedBadge />}
                  </div>
                  <p className="text-sm text-gray-500">{maid.user.email}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    ${parseFloat(maid.hourlyRate).toFixed(2)}/hr · {maid.yearsExperience} yrs exp · {maid.serviceAreaCodes.join(', ')}
                  </p>
                  {maid.bio && (
                    <div className="text-sm text-gray-500 mt-1 max-h-16 overflow-y-auto leading-relaxed">
                      {maid.bio}
                    </div>
                  )}
                  {maid.rejectedReason && (
                    <p className="text-xs text-red-600 mt-1">Rejection reason: {maid.rejectedReason}</p>
                  )}
                  {/* ID doc */}
                  <div className="mt-2 flex items-center gap-3">
                    {maid.hasIdDoc ? (
                      <button
                        onClick={() => handleViewIdDoc(maid.id)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        View ID Document
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">No ID document uploaded</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                  {maid.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => approveMutation.mutate(maid.id)}
                        disabled={approveMutation.isPending}
                        className="btn-primary text-sm px-3 py-1.5"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectTarget(maid)}
                        className="btn-danger text-sm px-3 py-1.5"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {/* Verification toggle — show on approved maids */}
                  {maid.status === 'APPROVED' && (
                    maid.isVerified ? (
                      <button
                        onClick={() => { if (confirm('Remove verification from this maid?')) unverifyMutation.mutate(maid.id); }}
                        disabled={unverifyMutation.isPending}
                        className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
                      >
                        Remove Verified
                      </button>
                    ) : (
                      <button
                        onClick={() => verifyMutation.mutate(maid.id)}
                        disabled={verifyMutation.isPending || !maid.hasIdDoc}
                        title={!maid.hasIdDoc ? 'Maid has not uploaded an ID document' : undefined}
                        className="text-xs text-green-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {verifyMutation.isPending ? 'Verifying…' : 'Mark as Verified'}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}

          {!isLoading && data?.maids.length === 0 && (
            <p className="text-center py-12 text-gray-500">No {statusFilter.toLowerCase()} maids.</p>
          )}
        </div>
        </>
        )}
      </div>

      {/* Reject maid profile modal */}
      <Modal isOpen={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Maid Application">
        <p className="text-sm text-gray-600 mb-3">
          Rejecting <strong>{rejectTarget?.user.fullName}</strong>. Please provide a reason.
        </p>
        <textarea
          className="input mb-4"
          rows={3}
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="e.g. Profile incomplete, insufficient experience…"
        />
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
          <button
            className="btn-danger"
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            onClick={() => rejectMutation.mutate({ id: rejectTarget!.id, reason: rejectReason })}
          >
            {rejectMutation.isPending ? <Spinner size="sm" /> : 'Confirm Reject'}
          </button>
        </div>
      </Modal>
      {/* Reject application modal */}
      <Modal isOpen={!!rejectAppTarget} onClose={() => setRejectAppTarget(null)} title="Reject Application">
        <p className="text-sm text-gray-600 mb-3">
          Rejecting <strong>{rejectAppTarget?.fullName}</strong>. Add a note (optional).
        </p>
        <textarea
          className="input mb-4"
          rows={3}
          value={rejectAppNotes}
          onChange={e => setRejectAppNotes(e.target.value)}
          placeholder="e.g. Not eligible to work in Canada…"
        />
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={() => setRejectAppTarget(null)}>Cancel</button>
          <button
            className="btn-danger"
            disabled={rejectAppMutation.isPending}
            onClick={() => rejectAppMutation.mutate({ id: rejectAppTarget!.id, notes: rejectAppNotes })}
          >
            {rejectAppMutation.isPending ? <Spinner size="sm" /> : 'Confirm Reject'}
          </button>
        </div>
      </Modal>
    </Layout>
  );
}
