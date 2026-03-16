import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roles: string[];
  maidStatus?: string;
  maidProfileId?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (accessToken: string, user: AuthUser, refreshToken?: string) => void;
  logout: () => void;
  updateSession: (accessToken: string, user: AuthUser) => void;
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY         = 'maidlink_token';
const REFRESH_TOKEN_KEY = 'maidlink_refresh_token';
const USER_KEY          = 'maidlink_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken]     = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser]       = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(true);

  // On mount: validate token, try silent refresh if expired
  useEffect(() => {
    async function initAuth() {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) { setIsLoading(false); return; }

      try {
        const [, payload] = storedToken.split('.');
        const decoded = JSON.parse(atob(payload));
        if (decoded.exp * 1000 > Date.now()) {
          // Token still valid — keep it
          setIsLoading(false);
          return;
        }
      } catch {
        // Malformed — fall through to refresh attempt
      }

      // Token expired or malformed — try refresh
      const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (storedRefresh) {
        try {
          const AUTH_BASE = (import.meta as any).env?.VITE_AUTH_API_URL || '/api/auth';
          const { default: axios } = await import('axios');
          const res = await axios.post(`${AUTH_BASE}/auth/refresh`, { refreshToken: storedRefresh });
          const { accessToken, refreshToken: newRefresh, user: freshUser } = res.data.data;
          setToken(accessToken);
          setUser(freshUser);
          localStorage.setItem(TOKEN_KEY, accessToken);
          localStorage.setItem(REFRESH_TOKEN_KEY, newRefresh);
          localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
          setIsLoading(false);
          return;
        } catch {
          // Refresh failed — clear everything
        }
      }

      setToken(null);
      setUser(null);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setIsLoading(false);
    }

    initAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback((accessToken: string, authUser: AuthUser, refreshToken?: string) => {
    setToken(accessToken);
    setUser(authUser);
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const updateSession = useCallback((accessToken: string, authUser: AuthUser) => {
    setToken(accessToken);
    setUser(authUser);
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
  }, []);

  const hasRole = useCallback(
    (role: string) => (user?.roles ?? []).includes(role),
    [user]
  );

  return (
    <AuthContext.Provider value={{
      user, token, isLoading,
      login, logout, updateSession,
      isAuthenticated: !!token && !!user,
      hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
