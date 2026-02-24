import { authClient } from './client';

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const res = await authClient.post('/auth/google', { code, redirectUri });
  return res.data.data as {
    accessToken: string;
    user: {
      id: string;
      email: string;
      fullName: string;
      avatarUrl: string | null;
      roles: string[];
    };
  };
}

export async function getMe() {
  const res = await authClient.get('/auth/me');
  return res.data.data;
}

export async function refreshToken() {
  const res = await authClient.post('/auth/refresh');
  return res.data.data as {
    accessToken: string;
    user: {
      id: string;
      email: string;
      fullName: string;
      avatarUrl: string | null;
      roles: string[];
      maidStatus?: string;
      maidProfileId?: string;
    };
  };
}

/**
 * Builds the Google OAuth authorization URL.
 * The user is redirected here when they click "Sign in with Google".
 */
export function buildGoogleAuthUrl(): string {
  const clientId    = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/auth/callback`;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
