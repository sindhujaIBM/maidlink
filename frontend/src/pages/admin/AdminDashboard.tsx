import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAdminMaids, listAdminBookings, listAdminUsers } from '../../api/admin';
import { Layout } from '../../components/layout/Layout';
import { Spinner } from '../../components/ui/Spinner';

function StatCard({ label, value, to }: { label: string; value: number | string; to: string }) {
  return (
    <Link to={to} className="card hover:shadow-md transition-shadow text-center">
      <p className="text-3xl font-bold text-brand-700">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </Link>
  );
}

export function AdminDashboard() {
  const { data: pendingData, isLoading: loadingMaids } = useQuery({
    queryKey: ['adminMaids', 'PENDING'],
    queryFn:  () => listAdminMaids({ status: 'PENDING' }),
  });
  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['adminBookings'],
    queryFn:  () => listAdminBookings({ status: 'CONFIRMED' }),
  });
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['adminUsers'],
    queryFn:  () => listAdminUsers(),
  });

  const isLoading = loadingMaids || loadingBookings || loadingUsers;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-500 mb-8">Manage maids, bookings, and users.</p>

        {isLoading
          ? <div className="flex justify-center py-16"><Spinner /></div>
          : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <StatCard label="Pending Approvals" value={pendingData?.total ?? 0} to="/admin/maids" />
              <StatCard label="Active Bookings"   value={bookings.length}           to="/admin/bookings" />
              <StatCard label="Total Users"        value={users.length}             to="/admin/users" />
            </div>
          )
        }

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/admin/maids" className="card hover:shadow-md transition-shadow">
            <div className="text-2xl mb-2">🧹</div>
            <h2 className="font-semibold text-gray-900">Maid Approvals</h2>
            <p className="text-sm text-gray-500 mt-1">Review and approve/reject maid applications.</p>
          </Link>
          <Link to="/admin/bookings" className="card hover:shadow-md transition-shadow">
            <div className="text-2xl mb-2">📅</div>
            <h2 className="font-semibold text-gray-900">All Bookings</h2>
            <p className="text-sm text-gray-500 mt-1">View all platform bookings.</p>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
