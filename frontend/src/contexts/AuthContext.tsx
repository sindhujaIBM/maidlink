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
  login: (accessToken: string, user: AuthUser) => void;
  logout: () => void;
  updateSession: (accessToken: string, user: AuthUser) => void;
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'maidlink_token';
const USER_KEY  = 'maidlink_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken]     = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser]       = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(false);

  // Validate stored token on mount (basic expiry check)
  useEffect(() => {
    if (!token) return;
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload));
      if (decoded.exp * 1000 < Date.now()) {
        // Token expired — clear session
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    } catch {
      // Malformed token
      setToken(null);
      setUser(null);
    }
    setIsLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback((accessToken: string, authUser: AuthUser) => {
    setToken(accessToken);
    setUser(authUser);
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
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
