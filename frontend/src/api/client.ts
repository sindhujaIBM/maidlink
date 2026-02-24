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

const TOKEN_KEY = 'maidlink_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
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
    err => {
      // Global 401 handler: clear session and redirect to login
      if (err.response?.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('maidlink_user');
        window.location.href = '/';
      }
      return Promise.reject(err);
    }
  );

  return client;
}

export const authClient    = makeClient(import.meta.env.VITE_AUTH_API_URL    || '/api/auth');
export const usersClient   = makeClient(import.meta.env.VITE_USERS_API_URL   || '/api/users');
export const bookingClient = makeClient(import.meta.env.VITE_BOOKING_API_URL || '/api/booking');
export const adminClient   = makeClient(import.meta.env.VITE_ADMIN_API_URL   || '/api/admin');
