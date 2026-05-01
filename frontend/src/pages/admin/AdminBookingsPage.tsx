import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAdminBookings } from '../../api/admin';
import { Layout } from '../../components/layout/Layout';
import { Badge, statusVariant } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { format, parseISO, isValid } from 'date-fns';

// All possible statuses including PENDING
const STATUS_FILTERS = ['', 'PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;

/** Safely format a time from an ISO string, falling back to '—' */
function formatTime(iso: string): string {
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'h:mm a') : '—';
}

/** Safely format a date from an ISO string, falling back to '—' */
function formatDate(iso: string): string {
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'MMM d, yyyy') : '—';
}

export function AdminBookingsPage() {
  const [statusFilter, setStatusFilter] = useState('');

  const { data: bookings = [], isLoading, isError } = useQuery({
    queryKey: ['adminBookings', statusFilter],
    queryFn:  () => listAdminBookings({ status: statusFilter || undefined }),
  });

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">All Bookings</h1>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {STATUS_FILTERS.map(s => (
            <button
              key={s || 'ALL'}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s || 'ALL'}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

        {isError && (
          <p className="text-center py-12 text-red-600">Failed to load bookings. Please try again.</p>
        )}

        {!isLoading && !isError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="pb-3 font-medium">Date / Time</th>
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Maid</th>
                  <th className="pb-3 font-medium">Total</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{formatDate(b.startAt)}</p>
                      <p className="text-gray-500">{formatTime(b.startAt)} – {formatTime(b.endAt)}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p>{b.customerName}</p>
                      <p className="text-gray-500 text-xs">{b.customerEmail}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p>{b.maidName}</p>
                      <p className="text-gray-500 text-xs">{b.maidEmail}</p>
                    </td>
                    <td className="py-3 pr-4 font-medium">${parseFloat(b.totalPrice).toFixed(2)}</td>
                    <td className="py-3">
                      <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {bookings.length === 0 && (
              <p className="text-center py-12 text-gray-500">No bookings found.</p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
