import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function Navbar() {
  const { user, isAuthenticated, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav className="bg-brand-700 border-b border-brand-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
            🧹 MaidLink
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-brand-100">
            <Link to="/estimate" className="hover:text-white">Estimator</Link>
            {isAuthenticated && (
              <>
                <Link to="/maids" className="hover:text-white">Browse Maids</Link>
                <Link to="/bookings" className="hover:text-white">My Bookings</Link>
                {hasRole('MAID') && (
                  <>
                    <Link to="/maid/availability" className="hover:text-white">My Availability</Link>
                    <Link to="/maid/bookings" className="hover:text-white">Maid Bookings</Link>
                    <Link to="/maid/earnings" className="hover:text-white">Earnings</Link>
                  </>
                )}
                {hasRole('ADMIN') && (
                  <Link to="/admin" className="hover:text-gold-400">Admin</Link>
                )}
              </>
            )}
          </div>

          {/* User area */}
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                <Link to="/profile" className="flex items-center gap-2 text-sm text-brand-100 hover:text-white">
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                    : <div className="h-8 w-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-semibold text-xs">{user.fullName[0]}</div>
                  }
                  <span className="hidden md:block">{user.fullName.split(' ')[0]}</span>
                </Link>
                <button onClick={handleLogout} className="text-xs px-3 py-1.5 rounded-lg border border-brand-400 text-white hover:bg-brand-600 transition-colors">
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/" className="text-sm px-4 py-2 rounded-lg bg-gold-500 text-white font-medium hover:bg-gold-600 transition-colors">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
