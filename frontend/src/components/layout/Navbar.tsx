import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { buildGoogleAuthUrl } from '../../api/auth';
import { Wordmark } from './Wordmark';

const C = {
  teal:  '#1F6E64',
  ink:   '#1A1F1E',
  line:  '#E6E1D3',
  cream: '#FBF7EE',
};

export function Navbar() {
  const { user, isAuthenticated, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav style={{ background: C.cream, borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', display: 'flex', height: 64, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>

        <Link to="/" style={{ textDecoration: 'none' }}>
          <Wordmark size={28} />
        </Link>

        <div style={{ display: 'none' }} className="md-nav">
          {/* spacer — links below are shown via flex on md+ via inline override */}
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 14, fontWeight: 500, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/estimate" style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>Estimator</Link>
          {isAuthenticated && (
            <>
              <Link to="/maids"    style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>Browse Maids</Link>
              <Link to="/bookings" style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>My Bookings</Link>
              {hasRole('MAID') && (
                <>
                  <Link to="/maid/availability" style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>My Availability</Link>
                  <Link to="/maid/bookings"     style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>Maid Bookings</Link>
                  <Link to="/maid/earnings"     style={{ color: C.ink, textDecoration: 'none', opacity: 0.85 }}>Earnings</Link>
                </>
              )}
              {hasRole('ADMIN') && (
                <Link to="/admin" style={{ color: C.teal, textDecoration: 'none', fontWeight: 600 }}>Admin</Link>
              )}
            </>
          )}
          <Link to="/become-a-maid" style={{ color: C.teal, textDecoration: 'none', fontWeight: 600 }}>Become a maid →</Link>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isAuthenticated && user ? (
            <>
              <Link to="/profile" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.ink, textDecoration: 'none', fontWeight: 500 }}>
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt="" style={{ height: 32, width: 32, borderRadius: '50%' }} />
                  : <div style={{ height: 32, width: 32, borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 12 }}>{user.fullName[0]}</div>
                }
                <span>{user.fullName.split(' ')[0]}</span>
              </Link>
              <button
                onClick={handleLogout}
                style={{ fontSize: 13, padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${C.line}`, background: 'transparent', color: C.ink, cursor: 'pointer', fontWeight: 500 }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a href={buildGoogleAuthUrl()} style={{ fontSize: 14, color: C.ink, textDecoration: 'none', fontWeight: 500 }}>Sign in</a>
              <Link to="/estimate" style={{ background: C.teal, color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Get a free estimate →
              </Link>
            </>
          )}
        </div>

      </div>
    </nav>
  );
}
