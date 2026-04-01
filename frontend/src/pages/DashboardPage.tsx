import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/layout/Layout';
import { Link } from 'react-router-dom';

/**
 * Post-login landing page.
 * Shows role-appropriate quick-links rather than redirecting forcefully.
 */
export function DashboardPage() {
  const { user, hasRole } = useAuth();
  if (!user) return <Navigate to="/" replace />;

  const cards = [
    { to: '/maids',            label: 'Browse Maids',        icon: '🔍', show: true },
    { to: '/estimate',         label: 'Estimate Cleaning',   icon: '✨', show: true },
    { to: '/bookings',         label: 'My Bookings',          icon: '📅', show: true },
    { to: '/profile',          label: 'My Profile',           icon: '👤', show: true },
    { to: '/maid/setup',       label: 'Maid Profile',         icon: '🧹', show: hasRole('MAID') },
    { to: '/maid/availability',label: 'My Availability',      icon: '🗓', show: hasRole('MAID') },
    { to: '/maid/bookings',    label: 'Incoming Bookings',    icon: '📋', show: hasRole('MAID') },
    { to: '/admin',            label: 'Admin Dashboard',      icon: '⚙️', show: hasRole('ADMIN') },
  ].filter(c => c.show);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome back, {user.fullName.split(' ')[0]}! 👋
        </h1>
        <p className="text-gray-500 mb-8">What would you like to do today?</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {cards.map(c => (
            <Link
              key={c.to}
              to={c.to}
              className="card flex flex-col items-center gap-2 text-center hover:shadow-md hover:border-brand-200 transition-all"
            >
              <span className="text-3xl">{c.icon}</span>
              <span className="text-sm font-medium text-gray-700">{c.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
