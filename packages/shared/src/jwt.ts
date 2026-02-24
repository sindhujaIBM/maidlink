import jwt from 'jsonwebtoken';
import type { JwtPayload } from './types/api';
import { UnauthorizedError } from './errors';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

/** Signs a JWT with 24-hour expiry. */
export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '24h', algorithm: 'HS256' });
}

/**
 * Verifies a Bearer token from an Authorization header.
 * Throws UnauthorizedError if missing, malformed, or expired.
 */
export function verifyToken(authHeader: string | undefined): JwtPayload {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }
  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
