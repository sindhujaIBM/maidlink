import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { buildGoogleAuthUrl } from '../api/auth';
import { EstimatorWidget } from '../components/estimator/EstimatorWidget';

export function HomePage() {
  const { isAuthenticated, hasRole } = useAuth();

  function handleGoogleSignIn() {
    window.location.href = buildGoogleAuthUrl();
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
        <div className="text-6xl mb-6">🧹</div>
        <h1 className="text-5xl font-bold text-brand-800 mb-4">
          MaidLink
        </h1>
        <p className="text-xl text-brand-600 mb-2 max-w-lg">
          Book trusted home cleaners in Calgary — fast, reliable, and always on time.
        </p>
        <p className="text-sm text-brand-400 mb-10">
          Minimum 3-hour bookings · Calgary-only service area
        </p>

        {isAuthenticated ? (
          <div className="flex gap-4">
            <Link to="/maids" className="btn-primary text-base px-6 py-3">
              Browse Maids
            </Link>
            {hasRole('MAID') && (
              <Link to="/maid/setup" className="btn-secondary text-base px-6 py-3">
                Maid Dashboard
              </Link>
            )}
          </div>
        ) : (
          <button
            onClick={handleGoogleSignIn}
            className="flex items-center gap-3 px-6 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 shadow-sm text-gray-700 font-medium text-base transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        )}

        {/* Feature highlights */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl w-full text-left">
          {[
            { icon: '🔒', title: 'No double-bookings — ever', desc: 'Database-level constraints guarantee your booking is exclusive.' },
            { icon: '📍', title: 'Calgary-only', desc: 'All maids are verified to service Calgary postal codes.' },
            { icon: '✅', title: 'Admin-verified maids', desc: 'Every maid is reviewed before appearing in search results.' },
          ].map(f => (
            <div key={f.title} className="card">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Estimator section */}
      <div className="bg-gray-50 border-t border-gray-200 py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-gray-900">Cleaning Time Estimator</h2>
            <p className="text-gray-500 text-sm mt-1">
              Find out how long your clean will take — instantly, no sign-in required.
            </p>
          </div>
          <EstimatorWidget />
        </div>
      </div>
    </div>
  );
}
