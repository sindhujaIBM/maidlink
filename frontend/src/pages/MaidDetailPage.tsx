import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMaid } from '../api/users';
import { getMaidSlots, createBooking, getMaidReviews } from '../api/bookings';
import { Layout } from '../components/layout/Layout';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Toast } from '../components/ui/Toast';
import { StarRating } from '../components/ui/StarRating';
import { VerifiedBadge } from '../components/ui/VerifiedBadge';
import { format, addDays } from 'date-fns';

const DAY_LABELS: Record<string, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu',
  FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};

export function MaidDetailPage() {
  const { maidId }    = useParams<{ maidId: string }>();
  const navigate      = useNavigate();
  const qc            = useQueryClient();
  const [searchParams] = useSearchParams();

  // Pre-fill hints from filter/scheduler
  const urlDate         = searchParams.get('date') ?? '';
  const urlTime         = searchParams.get('time') ?? '';
  const urlCleaningType = searchParams.get('cleaningType') ?? '';

  const today        = new Date();
  const fromDate     = format(today, 'yyyy-MM-dd');
  const toDate       = format(addDays(today, 7), 'yyyy-MM-dd');

  const { data: maid, isLoading } = useQuery({
    queryKey: ['maid', maidId],
    queryFn:  () => getMaid(maidId!),
    enabled:  !!maidId,
  });

  const { data: rawSlots = [] } = useQuery({
    queryKey: ['slots', maidId, fromDate, toDate],
    queryFn:  () => getMaidSlots(maidId!, fromDate, toDate),
    enabled:  !!maidId,
  });

  const { data: reviewsData } = useQuery({
    queryKey: ['maidReviews', maidId],
    queryFn:  () => getMaidReviews(maidId!, { limit: 5 }),
    enabled:  !!maidId,
  });

  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const slots = rawSlots.filter(s => new Date(s.startAt) >= oneHourFromNow);

  // Booking form state
  const [selectedSlot, setSelectedSlot] = useState<{ startAt: string; endAt: string } | null>(null);
  const [customEnd, setCustomEnd]        = useState('');
  const [address, setAddress]            = useState('');
  const [postal, setPostal]              = useState('');
  const [notes, setNotes]                = useState(urlCleaningType ? `Cleaning type: ${urlCleaningType}` : '');
  const [isBooking, setIsBooking]        = useState(false);
  const [bookError, setBookError]        = useState<string | null>(null);
  const [showSuccess, setShowSuccess]    = useState(false);

  // Auto-select slot matching URL date+time
  useEffect(() => {
    if (!urlDate || !urlTime || slots.length === 0 || selectedSlot) return;
    const target = `${urlDate}T${urlTime}`;
    const match = slots.find(s => s.startAt.startsWith(target));
    if (match) setSelectedSlot(match);
  }, [slots, urlDate, urlTime, selectedSlot]);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !maid) return;

    const endAt = customEnd
      ? new Date(`${selectedSlot.startAt.split('T')[0]}T${customEnd}:00.000Z`).toISOString()
      : new Date(new Date(selectedSlot.startAt).getTime() + 3 * 60 * 60 * 1000).toISOString();

    setIsBooking(true);
    setBookError(null);
    try {
      const storedKeys = sessionStorage.getItem('estimatorPhotoKeys');
      const beforePhotoKeys: string[] = storedKeys ? JSON.parse(storedKeys) : [];
      await createBooking({
        maidId:         maid.id,
        startAt:        selectedSlot.startAt,
        endAt,
        addressLine1:   address,
        postalCode:     postal,
        notes:          notes || undefined,
        beforePhotoKeys: beforePhotoKeys.length > 0 ? beforePhotoKeys : undefined,
      });
      sessionStorage.removeItem('estimatorPhotoKeys');
      await qc.invalidateQueries({ queryKey: ['bookings'] });
      setShowSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message || 'Booking failed. Please try again.';
      setBookError(msg);
    } finally {
      setIsBooking(false);
    }
  }

  if (isLoading) return <Layout><div className="flex justify-center py-20"><Spinner size="lg" /></div></Layout>;
  if (!maid)     return <Layout><p className="text-center py-20 text-gray-500">Maid not found.</p></Layout>;

  const rate = parseFloat(maid.hourlyRate).toFixed(2);
  const avgRating = parseFloat(maid.avgRating);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── Left: Profile ── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="flex gap-5 items-start">
              <div className="flex-shrink-0">
                {(maid.photoUrl || maid.user.avatarUrl)
                  ? <img src={maid.photoUrl || maid.user.avatarUrl!} alt="" className="h-24 w-24 rounded-full object-cover" />
                  : <div className="h-24 w-24 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-3xl font-bold">{maid.user.fullName[0]}</div>
                }
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900">{maid.user.fullName}</h1>
                  {maid.isVerified && <VerifiedBadge />}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <StarRating rating={avgRating} size="sm" />
                  <span className="text-sm text-gray-500">
                    {avgRating > 0
                      ? `${avgRating.toFixed(1)} · ${maid.reviewCount} review${maid.reviewCount !== 1 ? 's' : ''}`
                      : 'No reviews yet'}
                  </span>
                </div>
                <p className="text-brand-700 font-semibold text-lg mt-1">${rate}/hr</p>
                <p className="text-sm text-gray-500 mt-1">{maid.yearsExperience} years experience</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {maid.serviceAreaCodes.map(c => (
                    <Badge key={c} variant="blue">{c}</Badge>
                  ))}
                </div>
              </div>
            </div>
            {maid.bio && (
              <p className="mt-4 text-gray-600 text-sm leading-relaxed">{maid.bio}</p>
            )}
          </div>

          {/* Availability */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Weekly Availability</h2>
            {maid.recurringAvailability.length === 0
              ? <p className="text-sm text-gray-500">No recurring availability set.</p>
              : (
                <div className="space-y-1">
                  {maid.recurringAvailability.map(slot => (
                    <div key={slot.id} className="flex gap-3 text-sm">
                      <span className="w-10 text-gray-500">{DAY_LABELS[slot.dayOfWeek]}</span>
                      <span>{slot.startTime.slice(0, 5)} – {slot.endTime.slice(0, 5)}</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Reviews */}
          {reviewsData && reviewsData.reviews.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">
                Reviews ({reviewsData.total})
              </h2>
              <div className="space-y-4">
                {reviewsData.reviews.map(r => (
                  <div key={r.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{r.customerName}</span>
                      <span className="text-xs text-gray-400">{format(new Date(r.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="mt-1">
                      <StarRating rating={r.rating} size="sm" />
                    </div>
                    {r.comment && <p className="mt-1.5 text-sm text-gray-600">{r.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Booking form ── */}
        <div>
          <div className="card sticky top-24">
            <h2 className="font-semibold text-gray-900 mb-4">Book a Cleaning</h2>

            {/* Pre-fill hint from filters/chat */}
            {(urlDate || urlCleaningType) && (
              <div className="mb-3 rounded-lg bg-brand-50 border border-brand-200 p-3 text-xs text-brand-700">
                {urlCleaningType && <p className="font-medium">{urlCleaningType}</p>}
                {urlDate && urlTime && (
                  <p>Looking for {format(new Date(`${urlDate}T${urlTime}`), 'EEE, MMM d')} at {urlTime}</p>
                )}
                {urlDate && !urlTime && (
                  <p>Looking for availability on {format(new Date(urlDate + 'T00:00:00'), 'EEE, MMM d')}</p>
                )}
              </div>
            )}

            {/* Available slots (next 7 days) */}
            <div className="mb-4">
              <label className="label">Select a start time</label>
              <div className="space-y-2 max-h-48 overflow-y-scroll pr-1">
                {slots.length === 0
                  ? <p className="text-xs text-gray-500">No available slots in the next 7 days.</p>
                  : slots.map(slot => (
                    <button
                      key={slot.startAt}
                      type="button"
                      onClick={() => { setSelectedSlot(slot); setCustomEnd(''); }}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${
                        selectedSlot?.startAt === slot.startAt
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 hover:border-brand-300'
                      }`}
                    >
                      <span className="font-medium">{format(new Date(slot.startAt), 'EEE, MMM d')}</span>
                      <span className="ml-2 text-gray-500">{slot.startAt.slice(11, 16)} – {slot.endAt.slice(11, 16)}</span>
                    </button>
                  ))
                }
              </div>
            </div>

            {selectedSlot && (
              <form onSubmit={handleBook} className="space-y-3">
                <div>
                  <label className="label">Custom end time (HH:MM, optional)</label>
                  <input
                    type="time"
                    className="input"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    placeholder={selectedSlot.endAt.slice(11, 16)}
                  />
                  <p className="mt-1 text-xs text-gray-500">Leave blank to book 3 hours. Min 3 hours.</p>
                </div>

                <div>
                  <label className="label">Address *</label>
                  <input type="text" className="input" required value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St NW" />
                </div>

                <div>
                  <label className="label">Calgary Postal Code *</label>
                  <input type="text" className="input" required value={postal} onChange={e => setPostal(e.target.value.toUpperCase())} placeholder="T2P 1J9" maxLength={7} />
                </div>

                <div>
                  <label className="label">Notes</label>
                  <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions…" />
                </div>

                {bookError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{bookError}</div>
                )}

                <button type="submit" disabled={isBooking} className="btn-primary w-full">
                  {isBooking ? <Spinner size="sm" /> : null}
                  {isBooking ? 'Booking…' : `Confirm Booking · $${rate}/hr`}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      </div>

      {showSuccess && (
        <Toast
          message="Booking confirmed!"
          onDismiss={() => navigate('/bookings')}
        />
      )}
    </Layout>
  );
}
