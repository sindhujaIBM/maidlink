import { useState, useEffect } from 'react';
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

function useIsMobile(bp = 768) {
  const [mobile, setMobile] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return mobile;
}

export function Navbar() {
  const { user, isAuthenticated, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/');
    setMenuOpen(false);
  }

  return (
    <nav style={{ background: C.cream, borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '0 16px' : '0 24px', display: 'flex', height: 64, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>

        <Link to="/" style={{ textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>
          <Wordmark size={isMobile ? 22 : 28} />
        </Link>

        {/* Desktop nav links */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 24, fontSize: 14, fontWeight: 500, alignItems: 'center' }}>
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
        )}

        {/* Right side */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!isMobile && (
            isAuthenticated && user ? (
              <>
                <Link to="/profile" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.ink, textDecoration: 'none', fontWeight: 500 }}>
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt="" style={{ height: 32, width: 32, borderRadius: '50%' }} />
                    : <div style={{ height: 32, width: 32, borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 12 }}>{user.fullName[0]}</div>
                  }
                  <span>{user.fullName.split(' ')[0]}</span>
                </Link>
                <button onClick={handleLogout} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${C.line}`, background: 'transparent', color: C.ink, cursor: 'pointer', fontWeight: 500 }}>
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
            )
          )}

          {/* Mobile: avatar or hamburger */}
          {isMobile && isAuthenticated && user && (
            <Link to="/profile" style={{ display: 'flex', alignItems: 'center' }}>
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" style={{ height: 32, width: 32, borderRadius: '50%' }} />
                : <div style={{ height: 32, width: 32, borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 12 }}>{user.fullName[0]}</div>
              }
            </Link>
          )}
          {isMobile && (
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}
              aria-label="Menu"
            >
              <span style={{ display: 'block', width: 22, height: 2, background: C.ink, borderRadius: 2, transition: 'transform 0.2s', transform: menuOpen ? 'rotate(45deg) translateY(7px)' : 'none' }} />
              <span style={{ display: 'block', width: 22, height: 2, background: C.ink, borderRadius: 2, opacity: menuOpen ? 0 : 1, transition: 'opacity 0.2s' }} />
              <span style={{ display: 'block', width: 22, height: 2, background: C.ink, borderRadius: 2, transition: 'transform 0.2s', transform: menuOpen ? 'rotate(-45deg) translateY(-7px)' : 'none' }} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile drawer */}
      {isMobile && menuOpen && (
        <div style={{ background: C.cream, borderTop: `1px solid ${C.line}`, padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { to: '/estimate',    label: 'Estimator' },
            ...(isAuthenticated ? [
              { to: '/maids',     label: 'Browse Maids' },
              { to: '/bookings',  label: 'My Bookings' },
              ...(hasRole('MAID') ? [
                { to: '/maid/availability', label: 'My Availability' },
                { to: '/maid/bookings',     label: 'Maid Bookings' },
                { to: '/maid/earnings',     label: 'Earnings' },
              ] : []),
              ...(hasRole('ADMIN') ? [{ to: '/admin', label: 'Admin' }] : []),
            ] : []),
            { to: '/become-a-maid', label: 'Become a maid →' },
          ].map(item => (
            <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)}
              style={{ padding: '14px 0', fontSize: 15, fontWeight: 500, color: item.label.includes('→') ? C.teal : C.ink, textDecoration: 'none', borderBottom: `1px solid ${C.line}` }}>
              {item.label}
            </Link>
          ))}
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {isAuthenticated ? (
              <button onClick={handleLogout} style={{ padding: '12px', borderRadius: 10, border: `1.5px solid ${C.line}`, background: 'transparent', color: C.ink, cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>
                Sign out
              </button>
            ) : (
              <>
                <a href={buildGoogleAuthUrl()} style={{ padding: '12px', borderRadius: 10, border: `1.5px solid ${C.line}`, textAlign: 'center', color: C.ink, textDecoration: 'none', fontWeight: 500, fontSize: 14 }}>
                  Sign in
                </a>
                <Link to="/estimate" onClick={() => setMenuOpen(false)} style={{ padding: '13px', borderRadius: 10, background: C.teal, textAlign: 'center', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
                  Get a free estimate →
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
