import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { AuthUser } from '../contexts/AuthContext';

const DEV_ACCOUNTS = [
  {
    userId:   'aaaaaaaa-0000-0000-0000-000000000001',
    name:     'MaidLink Admin',
    email:    'admin@maidlink.local',
    roles:    ['ADMIN', 'CUSTOMER'],
    redirect: '/admin',
  },
  {
    userId:   'bbbbbbbb-0000-0000-0000-000000000001',
    name:     'Sarah Thompson',
    email:    'sarah@maidlink.local',
    roles:    ['MAID', 'CUSTOMER'],
    redirect: '/maid/bookings',
  },
  {
    userId:   'bbbbbbbb-0000-0000-0000-000000000002',
    name:     'Maria Gonzalez',
    email:    'maria@maidlink.local',
    roles:    ['MAID', 'CUSTOMER'],
    redirect: '/maid/bookings',
  },
  {
    userId:   'dddddddd-0000-0000-0000-000000000001',
    name:     'Alice Chen',
    email:    'alice@maidlink.local',
    roles:    ['CUSTOMER'],
    redirect: '/dashboard',
  },
];

export function DevLoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function handleLogin(account: typeof DEV_ACCOUNTS[0]) {
    setLoading(account.userId);
    setError(null);
    try {
      const res = await authClient.post('/auth/dev-login', { userId: account.userId });
      const { accessToken, user } = res.data.data as { accessToken: string; user: AuthUser };
      login(accessToken, user);
      navigate(account.redirect);
    } catch {
      setError('Dev login failed — is the auth service running?');
    } finally {
      setLoading(null);
    }
  }

  const roleColour: Record<string, string> = {
    ADMIN:    'bg-red-100 text-red-700',
    MAID:     'bg-brand-100 text-brand-700',
    CUSTOMER: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🧹</div>
          <h1 className="text-2xl font-bold text-gray-900">Dev Login</h1>
          <p className="text-sm text-gray-500 mt-1">Local development only — not available in production</p>
        </div>

        <div className="space-y-3">
          {DEV_ACCOUNTS.map(account => (
            <button
              key={account.userId}
              onClick={() => handleLogin(account)}
              disabled={!!loading}
              className="w-full card text-left hover:shadow-md hover:border-brand-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{account.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{account.email}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {account.roles.map(r => (
                    <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColour[r]}`}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              {loading === account.userId && (
                <p className="text-xs text-brand-600 mt-2">Signing in…</p>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-red-600">{error}</p>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">
          To use real Google OAuth, go to the{' '}
          <a href="/" className="underline hover:text-gray-600">home page</a>.
        </p>
      </div>
    </div>
  );
}
