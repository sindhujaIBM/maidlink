import type { Page } from '@playwright/test';

function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** Builds a minimal JWT the frontend will accept (it only checks `exp`, not signature). */
export function makeFakeJwt(userId = 'e2e-user-id', expiresInSec = 86_400): string {
  const header  = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub:   userId,
    email: 'e2e@test.local',
    roles: ['CUSTOMER'],
    exp:   Math.floor(Date.now() / 1000) + expiresInSec,
  }));
  return `${header}.${payload}.e2e-fake-signature`;
}

/**
 * Injects a fake JWT and user object into localStorage before the page loads.
 * Call this before page.goto() so the AuthContext picks it up on mount.
 */
export async function injectAuth(page: Page, userId = 'e2e-user-id'): Promise<void> {
  await page.addInitScript(
    ({ token, userJson }) => {
      localStorage.setItem('maidlink_token', token);
      localStorage.setItem('maidlink_user',  userJson);
    },
    {
      token:    makeFakeJwt(userId),
      userJson: JSON.stringify({
        id:       userId,
        email:    'e2e@test.local',
        fullName: 'E2E Test User',
        roles:    ['CUSTOMER'],
      }),
    },
  );
}
