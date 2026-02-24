import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { exchangeGoogleCode } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import { FullPageSpinner } from '../components/ui/Spinner';

/**
 * Handles the redirect from Google OAuth.
 * Google returns ?code=... to this page.
 * We extract the code, exchange it for a JWT, then redirect to the dashboard.
 */
export function AuthCallback() {
  const navigate    = useNavigate();
  const { login }   = useAuth();
  const processed   = useRef(false); // Prevent double-processing in StrictMode

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code   = params.get('code');
      const error  = params.get('error');

      if (error) {
        console.error('OAuth error:', error);
        navigate('/?error=oauth_denied');
        return;
      }

      if (!code) {
        navigate('/?error=no_code');
        return;
      }

      try {
        const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI
          || `${window.location.origin}/auth/callback`;

        const { accessToken, user } = await exchangeGoogleCode(code, redirectUri);
        login(accessToken, user);
        navigate('/dashboard');
      } catch (err) {
        console.error('Auth callback failed:', err);
        navigate('/?error=auth_failed');
      }
    }

    handleCallback();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <FullPageSpinner />;
}
