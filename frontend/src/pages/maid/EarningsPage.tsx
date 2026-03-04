import { useQuery } from '@tanstack/react-query';
import { getEarnings } from '../../api/bookings';
import { Layout } from '../../components/layout/Layout';
import { Spinner } from '../../components/ui/Spinner';
import { format } from 'date-fns';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function duration(startAt: string, endAt: string) {
  const hours = (new Date(endAt).getTime() - new Date(startAt).getTime()) / (1000 * 60 * 60);
  return `${hours.toFixed(1)}h`;
}

export function EarningsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['earnings'],
    queryFn:  getEarnings,
  });

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Earnings</h1>

        {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Total Earned"
                value={`$${parseFloat(data.summary.totalEarned).toFixed(2)}`}
                sub={`${data.summary.completedCount} completed job${data.summary.completedCount !== 1 ? 's' : ''}`}
              />
              <StatCard
                label="This Month"
                value={`$${parseFloat(data.summary.thisMonthEarned).toFixed(2)}`}
                sub={format(new Date(), 'MMMM yyyy')}
              />
              <StatCard
                label="Pending"
                value={`$${parseFloat(data.summary.pendingEarnings).toFixed(2)}`}
                sub={`${data.summary.upcomingCount} upcoming job${data.summary.upcomingCount !== 1 ? 's' : ''}`}
              />
            </div>

            {/* Upcoming bookings */}
            {data.upcomingBookings.length > 0 && (
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-4">Upcoming Jobs</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 text-xs border-b border-gray-100">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium">Duration</th>
                        <th className="pb-2 font-medium text-right">Expected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.upcomingBookings.map(b => (
                        <tr key={b.id}>
                          <td className="py-2.5 text-gray-900">{format(new Date(b.startAt), 'EEE, MMM d')}</td>
                          <td className="py-2.5 text-gray-600">{b.customerName}</td>
                          <td className="py-2.5 text-gray-500">{duration(b.startAt, b.endAt)}</td>
                          <td className="py-2.5 text-right font-medium text-gray-900">${parseFloat(b.totalPrice).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Earnings history */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Earnings History</h2>
              {data.completedBookings.length === 0 ? (
                <p className="text-sm text-gray-500">No completed bookings yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 text-xs border-b border-gray-100">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium">Duration</th>
                        <th className="pb-2 font-medium text-right">Earned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.completedBookings.map(b => (
                        <tr key={b.id}>
                          <td className="py-2.5 text-gray-900">{format(new Date(b.startAt), 'EEE, MMM d, yyyy')}</td>
                          <td className="py-2.5 text-gray-600">{b.customerName}</td>
                          <td className="py-2.5 text-gray-500">{duration(b.startAt, b.endAt)}</td>
                          <td className="py-2.5 text-right font-medium text-green-700">${parseFloat(b.totalPrice).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
