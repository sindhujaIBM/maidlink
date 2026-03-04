import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listAdminMaids, approveMaid, rejectMaid, verifyMaid, unverifyMaid, getAdminIdDocUrl, type AdminMaid } from '../../api/admin';
import { Layout } from '../../components/layout/Layout';
import { Badge, statusVariant } from '../../components/ui/Badge';
import { VerifiedBadge } from '../../components/ui/VerifiedBadge';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';

export function AdminMaidsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [rejectTarget, setRejectTarget] = useState<AdminMaid | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['adminMaids', statusFilter],
    queryFn:  () => listAdminMaids({ status: statusFilter }),
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

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Maid Approval Queue</h1>

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
                  {maid.bio && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{maid.bio}</p>}
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
      </div>

      {/* Reject modal */}
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
    </Layout>
  );
}
