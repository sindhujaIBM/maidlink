import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listBookings, completeBooking } from '../../api/bookings';
import { Layout } from '../../components/layout/Layout';
import { Badge, statusVariant } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { format } from 'date-fns';

export function MaidBookingsPage() {
  const qc = useQueryClient();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings', 'maid'],
    queryFn:  () => listBookings({ role: 'maid' }),
  });

  const completeMutation = useMutation({
    mutationFn: completeBooking,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });

  const now = new Date();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Incoming Bookings</h1>

        {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

        {!isLoading && bookings.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-4">📋</div>
            <p className="font-medium">No bookings yet</p>
          </div>
        )}

        <div className="space-y-4">
          {bookings.map(b => {
            const started = new Date(b.startAt) < now;
            const canComplete = b.status === 'CONFIRMED' && started;

            return (
              <div key={b.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{b.customerName}</span>
                      <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {format(new Date(b.startAt), 'EEE, MMM d, yyyy')} · {b.startAt.slice(11,16)} – {b.endAt.slice(11,16)}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{b.addressLine1}, {b.postalCode}</p>
                    {b.notes && <p className="text-xs text-gray-400 mt-1 italic">"{b.notes}"</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-gray-900">${parseFloat(b.totalPrice).toFixed(2)}</p>
                    {canComplete && (
                      <button
                        onClick={() => {
                          if (confirm('Mark this job as complete?')) completeMutation.mutate(b.id);
                        }}
                        disabled={completeMutation.isPending}
                        className="mt-2 text-xs text-brand-600 hover:underline disabled:opacity-50"
                      >
                        {completeMutation.isPending ? 'Updating…' : 'Mark as Complete'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
