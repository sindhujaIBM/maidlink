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
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-brand-700">
            🧹 MaidLink
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            {isAuthenticated && (
              <>
                <Link to="/maids" className="hover:text-brand-600">Browse Maids</Link>
                <Link to="/bookings" className="hover:text-brand-600">My Bookings</Link>
                {hasRole('MAID') && (
                  <>
                    <Link to="/maid/availability" className="hover:text-brand-600">My Availability</Link>
                    <Link to="/maid/bookings" className="hover:text-brand-600">Maid Bookings</Link>
                  </>
                )}
                {hasRole('ADMIN') && (
                  <Link to="/admin" className="hover:text-red-600">Admin</Link>
                )}
              </>
            )}
          </div>

          {/* User area */}
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                <Link to="/profile" className="flex items-center gap-2 text-sm text-gray-700 hover:text-brand-600">
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                    : <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-xs">{user.fullName[0]}</div>
                  }
                  <span className="hidden md:block">{user.fullName.split(' ')[0]}</span>
                </Link>
                <button onClick={handleLogout} className="btn-secondary text-xs px-3 py-1.5">
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/" className="btn-primary text-sm">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
