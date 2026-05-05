import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listBookings, getBooking, cancelBooking, completeBooking, createReview } from '../api/bookings';
import { Layout } from '../components/layout/Layout';
import { Badge, statusVariant } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { StarRating } from '../components/ui/StarRating';
import { format, parseISO, isValid } from 'date-fns';

function safeFormatTime(iso: string) {
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'h:mm a') : '—';
}

export function BookingsPage() {
  const qc = useQueryClient();
  const [reviewTarget,   setReviewTarget]   = useState<string | null>(null);
  const [rating,         setRating]         = useState(0);
  const [comment,        setComment]        = useState('');
  const [reviewedIds,    setReviewedIds]    = useState<Set<string>>(new Set());
  const [reviewError,    setReviewError]    = useState('');
  const [photosTarget,   setPhotosTarget]   = useState<string | null>(null);
  // Inline confirmation state: bookingId → which action is pending
  const [confirmPending, setConfirmPending] = useState<{ id: string; action: 'cancel' | 'complete' } | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings', 'customer'],
    queryFn:  () => listBookings({ role: 'customer' }),
  });

  // Fetch full booking detail (with presigned photo URLs) only when the photo modal is open
  const { data: photoBooking, isLoading: photosLoading } = useQuery({
    queryKey: ['booking', photosTarget],
    queryFn:  () => getBooking(photosTarget!),
    enabled:  !!photosTarget,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelBooking(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });

  const completeMutation = useMutation({
    mutationFn: completeBooking,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ bookingId, rating, comment }: { bookingId: string; rating: number; comment: string }) =>
      createReview(bookingId, { rating, comment: comment || undefined }),
    onSuccess: (_, { bookingId }) => {
      setReviewedIds(prev => new Set(prev).add(bookingId));
      setReviewTarget(null);
      setRating(0);
      setComment('');
      setReviewError('');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to submit review';
      setReviewError(msg);
    },
  });

  function openReview(bookingId: string) {
    setReviewTarget(bookingId);
    setRating(0);
    setComment('');
    setReviewError('');
  }

  function submitReview() {
    if (!reviewTarget || rating === 0) { setReviewError('Please select a star rating.'); return; }
    reviewMutation.mutate({ bookingId: reviewTarget, rating, comment });
  }

  const now = new Date();

  return (
    <Layout>
      <Helmet><title>My Bookings — MaidLink</title></Helmet>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Bookings</h1>

        {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

        {!isLoading && bookings.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-4">📅</div>
            <p className="font-medium">No bookings yet</p>
            <p className="text-sm mt-1">Browse maids to book your first cleaning.</p>
          </div>
        )}

        <div className="space-y-4">
          {bookings.map(b => {
            const started    = new Date(b.startAt) < now;
            const canComplete = b.status === 'CONFIRMED' && started;
            const canReview  = b.status === 'COMPLETED' && !reviewedIds.has(b.id);
            const hasPhotos  = (b.beforePhotoKeys?.length ?? 0) > 0 || (b.afterPhotoKeys?.length ?? 0) > 0;

            return (
              <div key={b.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{b.maidName}</span>
                      <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {format(parseISO(b.startAt), 'EEE, MMM d, yyyy')} · {safeFormatTime(b.startAt)} – {safeFormatTime(b.endAt)}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{b.addressLine1}, {b.city} {b.postalCode}</p>

                    {hasPhotos && (
                      <button
                        onClick={() => setPhotosTarget(b.id)}
                        className="mt-2 text-xs text-brand-600 hover:underline flex items-center gap-1"
                      >
                        📸 View before / after photos
                      </button>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-gray-900">${parseFloat(b.totalPrice).toFixed(2)}</p>
                    <div className="flex flex-col items-end gap-1 mt-2">
                      {canComplete && (
                        confirmPending?.id === b.id && confirmPending.action === 'complete' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Mark complete?</span>
                            <button
                              onClick={() => { completeMutation.mutate(b.id); setConfirmPending(null); }}
                              className="text-xs font-medium text-brand-600 hover:underline"
                            >Yes</button>
                            <button onClick={() => setConfirmPending(null)} className="text-xs text-gray-400 hover:underline">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmPending({ id: b.id, action: 'complete' })}
                            disabled={completeMutation.isPending}
                            className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                          >
                            {completeMutation.isPending ? 'Updating…' : 'Mark as Complete'}
                          </button>
                        )
                      )}
                      {canReview && (
                        <button onClick={() => openReview(b.id)} className="text-xs text-brand-600 hover:underline">
                          Leave a Review
                        </button>
                      )}
                      {b.status === 'COMPLETED' && reviewedIds.has(b.id) && (
                        <span className="text-xs text-gray-400">Reviewed ✓</span>
                      )}
                      {b.status === 'CONFIRMED' && !started && (
                        confirmPending?.id === b.id && confirmPending.action === 'cancel' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Cancel booking?</span>
                            <button
                              onClick={() => { cancelMutation.mutate(b.id); setConfirmPending(null); }}
                              className="text-xs font-medium text-red-600 hover:underline"
                            >Yes</button>
                            <button onClick={() => setConfirmPending(null)} className="text-xs text-gray-400 hover:underline">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmPending({ id: b.id, action: 'cancel' })}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Cancel
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Before/After Photo Modal */}
      <Modal isOpen={!!photosTarget} onClose={() => setPhotosTarget(null)} title="Before / After Photos">
        {photosLoading && <div className="flex justify-center py-8"><Spinner size="lg" /></div>}
        {photoBooking && !photosLoading && (
          <div className="space-y-6">
            <PhotoGrid
              title="Before — estimator photos"
              urls={photoBooking.beforePhotoUrls ?? []}
              emptyText="No before photos attached to this booking"
            />
            <PhotoGrid
              title="After — maid completion photos"
              urls={photoBooking.afterPhotoUrls ?? []}
              emptyText="The maid hasn't uploaded completion photos yet"
            />
          </div>
        )}
      </Modal>

      {/* Review modal */}
      <Modal isOpen={!!reviewTarget} onClose={() => setReviewTarget(null)} title="Leave a Review">
        <div className="space-y-4">
          <div>
            <label className="label">Rating</label>
            <StarRating rating={rating} size="md" interactive onChange={setRating} />
          </div>
          <div>
            <label className="label">Comment (optional)</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              className="input w-full"
              placeholder="Share your experience…"
            />
          </div>
          {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={() => setReviewTarget(null)} className="btn btn-secondary">Cancel</button>
            <button
              onClick={submitReview}
              disabled={reviewMutation.isPending || rating === 0}
              className="btn btn-primary disabled:opacity-50"
            >
              {reviewMutation.isPending ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

function PhotoGrid({ title, urls, emptyText }: { title: string; urls: string[]; emptyText: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      {urls.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {urls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer"
              className="aspect-square rounded-lg overflow-hidden bg-gray-100 block">
              <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover hover:opacity-90 transition-opacity" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
