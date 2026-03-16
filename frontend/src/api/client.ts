/**
 * Axios instances for each backend service.
 *
 * In local dev, Vite proxies /api/* to the appropriate service port.
 * In production, set the VITE_*_API_URL env vars to the real API Gateway URLs.
 *
 * The auth interceptor reads the JWT from localStorage and attaches it
 * to every request as Authorization: Bearer <token>.
 */

import axios from 'axios';

const TOKEN_KEY         = 'maidlink_token';
const REFRESH_TOKEN_KEY = 'maidlink_refresh_token';
const USER_KEY          = 'maidlink_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = '/';
}

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

async function attemptTokenRefresh(): Promise<string | null> {
  const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!storedRefreshToken) return null;

  const AUTH_BASE = import.meta.env.VITE_AUTH_API_URL || '/api/auth';
  try {
    const res = await axios.post(`${AUTH_BASE}/auth/refresh`, { refreshToken: storedRefreshToken });
    const { accessToken, refreshToken: newRefreshToken, user } = res.data.data;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return accessToken;
  } catch {
    return null;
  }
}

function makeClient(baseURL: string) {
  const client = axios.create({ baseURL });

  client.interceptors.request.use(config => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    res => res,
    async err => {
      if (err.response?.status !== 401) return Promise.reject(err);

      // Don't retry the refresh endpoint itself
      if (err.config?.url?.includes('/auth/refresh')) {
        clearSession();
        return Promise.reject(err);
      }

      if (isRefreshing) {
        // Queue subsequent 401s until refresh completes
        return new Promise((resolve) => {
          refreshQueue.push(token => {
            err.config.headers.Authorization = `Bearer ${token}`;
            resolve(client.request(err.config));
          });
        });
      }

      isRefreshing = true;
      const newToken = await attemptTokenRefresh();
      isRefreshing = false;

      if (!newToken) {
        refreshQueue = [];
        clearSession();
        return Promise.reject(err);
      }

      // Drain queue
      refreshQueue.forEach(cb => cb(newToken));
      refreshQueue = [];

      // Retry original request
      err.config.headers.Authorization = `Bearer ${newToken}`;
      return client.request(err.config);
    }
  );

  return client;
}

export const authClient    = makeClient(import.meta.env.VITE_AUTH_API_URL    || '/api/auth');
export const usersClient   = makeClient(import.meta.env.VITE_USERS_API_URL   || '/api/users');
export const bookingClient = makeClient(import.meta.env.VITE_BOOKING_API_URL || '/api/booking');
export const adminClient   = makeClient(import.meta.env.VITE_ADMIN_API_URL   || '/api/admin');
