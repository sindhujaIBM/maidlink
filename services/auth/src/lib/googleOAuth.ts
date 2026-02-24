/**
 * Google OAuth helpers.
 *
 * Flow:
 *   1. Frontend redirects user to Google OAuth consent screen.
 *   2. Google redirects back to frontend with ?code=...
 *   3. Frontend POSTs { code, redirectUri } to POST /auth/google.
 *   4. This Lambda exchanges the code for tokens, verifies the id_token,
 *      and returns the user's profile from the id_token claims.
 */

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  scope: string;
  token_type: string;
}

interface GoogleUserInfo {
  sub: string;       // Unique Google user ID
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

/**
 * Exchanges an authorization code for Google tokens.
 * Uses the token endpoint directly (server-side, keeps client_secret safe).
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri:  redirectUri,
    grant_type:    'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed: ${body}`);
  }

  return res.json() as Promise<GoogleTokenResponse>;
}

/**
 * Verifies a Google id_token using Google's tokeninfo endpoint.
 *
 * Trade-off: Using Google's endpoint instead of local JWKS verification
 * adds an extra HTTP call (~100ms) but avoids importing the full JWKS/JWT
 * verification stack. For MVP this is acceptable.
 * Post-MVP: use google-auth-library for offline JWKS verification.
 */
export async function verifyIdToken(idToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!res.ok) {
    throw new Error('Failed to verify Google id_token');
  }

  const info = await res.json() as GoogleUserInfo & { aud: string };

  // Verify the token was issued for our client
  if (info.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new Error('id_token audience mismatch');
  }

  if (!info.email_verified) {
    throw new Error('Google email is not verified');
  }

  return info;
}
